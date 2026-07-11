import { createHmac } from "node:crypto";
import {
  InMemoryRateLimitStore,
  createHoneypotTimingCheck,
  createScopedRateLimitCheck,
  moderationStatusForDecisions,
  toModerationAuditEntries,
  type ModerationCheckInput,
  type ModerationDecision,
  type RateLimitDecision,
  type RateLimitStore,
} from "../moderation";
import type { EngagementRateLimitScope, EngagementRepository } from "./repository";
import type {
  CommentSubmissionInput,
  CommentSubmissionResult,
  EngagementActor,
  EngagementRequestContext,
  EngagementSummary,
  LikePostInput,
  LikePostResult,
  SharePostByEmailInput,
  SharePostByEmailResult,
} from "./types";

type EngagementModerationInput = ModerationCheckInput & {
  requestContext?: EngagementRequestContext;
};

type HashIdentifier = (value: string) => string;

export type EngagementServiceOptions = {
  now?: () => Date;
  commentRateLimit?: {
    windowSeconds: number;
    maxAttempts: number;
  };
  likeRateLimit?: {
    windowSeconds: number;
    maxAttempts: number;
  };
  emailShareRateLimit?: {
    windowSeconds: number;
    maxAttempts: number;
  };
  scopedRateLimitStore?: RateLimitStore | null;
  identifierHashSalt?: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const defaultCommentLimit = { windowSeconds: 10 * 60, maxAttempts: 5 };
const defaultLikeLimit = { windowSeconds: 60, maxAttempts: 20 };
const defaultEmailShareLimit = { windowSeconds: 60 * 60, maxAttempts: 3 };
const defaultIdentifierHashSalt = "qscm-dev-engagement-salt";
const honeypotTimingCheck = createHoneypotTimingCheck();
const blockedPhrases = ["buy followers", "crypto giveaway", "free money", "casino bonus"];

export class EngagementService {
  private readonly now: () => Date;
  private readonly commentRateLimit: Required<EngagementServiceOptions>["commentRateLimit"];
  private readonly likeRateLimit: Required<EngagementServiceOptions>["likeRateLimit"];
  private readonly emailShareRateLimit: Required<EngagementServiceOptions>["emailShareRateLimit"];
  private readonly scopedRateLimitStore?: RateLimitStore;
  private readonly identifierHashSalt: string;

  constructor(
    private readonly repository: EngagementRepository,
    options: EngagementServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.commentRateLimit = options.commentRateLimit ?? defaultCommentLimit;
    this.likeRateLimit = options.likeRateLimit ?? defaultLikeLimit;
    this.emailShareRateLimit = options.emailShareRateLimit ?? defaultEmailShareLimit;
    this.scopedRateLimitStore =
      options.scopedRateLimitStore === undefined
        ? new InMemoryRateLimitStore()
        : options.scopedRateLimitStore ?? undefined;
    this.identifierHashSalt = resolveIdentifierHashSalt(options.identifierHashSalt);
  }

  async getSummary(postSlug: string, actor?: EngagementActor): Promise<EngagementSummary> {
    const [comments, likeCount, viewerHasLiked] = await Promise.all([
      this.repository.listApprovedComments(postSlug),
      this.repository.countLikes(postSlug),
      actor ? this.repository.hasLiked(postSlug, actor) : Promise.resolve(false),
    ]);

    return {
      postSlug,
      likeCount,
      viewerHasLiked,
      comments,
      commentCount: comments.length,
    };
  }

  async submitComment(input: CommentSubmissionInput): Promise<CommentSubmissionResult> {
    const normalized = normalizeCommentInput(input, (value) => this.hashIdentifier(value));
    const fieldErrors = validateComment(normalized);

    if (Object.keys(fieldErrors).length > 0) {
      return {
        ok: false,
        status: "invalid",
        message: "Please check the comment form.",
        fieldErrors,
      };
    }

    if (!(await this.repository.postExists(normalized.postSlug))) {
      return {
        ok: false,
        status: "not_found",
        message: "That post could not be found.",
      };
    }

    const moderationInput = commentModerationInput(normalized, this.now());
    const rateLimit = await this.checkRateLimit(
      "comment",
      moderationInput,
      this.commentRateLimit,
    );

    if (rateLimit.limited) {
      return {
        ok: false,
        status: "rate_limited",
        message: "Please wait a bit before posting another comment.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      };
    }

    const decisions = commentDecisions(normalized, moderationInput);
    const moderationStatus = moderationStatusForDecisions(decisions);
    const now = this.now();
    const comment = await this.repository.storeComment({
      postSlug: normalized.postSlug,
      body: normalized.body,
      authorKind: normalized.actor.kind,
      authorDisplayName: normalized.name,
      authorEmail: normalized.email,
      authorWebsite: normalized.website,
      registeredUserId:
        normalized.actor.kind === "registered_user" ? normalized.actor.userId : undefined,
      moderationStatus,
      moderationAudit: toModerationAuditEntries(decisions, now),
      requestContext: normalized.requestContext,
      now,
    });

    if (!comment) {
      return {
        ok: false,
        status: "not_found",
        message: "That post could not be found.",
      };
    }

    if (moderationStatus === "blocked") {
      return {
        ok: true,
        status: "blocked",
        message: "Thanks. This comment will not appear because it matched our spam protections.",
      };
    }

    if (moderationStatus === "suspicious") {
      return {
        ok: true,
        status: "held",
        message: "Thanks. Your comment is waiting for review.",
      };
    }

    return {
      ok: true,
      status: "published",
      comment,
      message: "Published. Thanks for joining the conversation.",
    };
  }

  async likePost(input: LikePostInput): Promise<LikePostResult> {
    if (!(await this.repository.postExists(input.postSlug))) {
      return {
        ok: false,
        status: "not_found",
        message: "That post could not be found.",
      };
    }

    const requestContext = sanitizeEngagementRequestContext({
      ...input.requestContext,
      anonymousActorHash: input.actor.anonymousActorHash,
    });
    const rateLimit = await this.checkRateLimit(
      "like",
      {
        postSlug: input.postSlug,
        body: "",
        commenterName: "",
        registeredUserId: registeredUserId(input.actor),
        submittedAt: this.now(),
        requestContext,
      },
      this.likeRateLimit,
    );

    if (rateLimit.limited) {
      return {
        ok: false,
        status: "rate_limited",
        message: "Please wait a bit before liking more posts.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      };
    }

    const liked = await this.repository.likePost(input.postSlug, input.actor, this.now());
    if (!liked) {
      return {
        ok: false,
        status: "not_found",
        message: "That post could not be found.",
      };
    }

    return {
      ok: true,
      liked: true,
      likeCount: await this.repository.countLikes(input.postSlug),
    };
  }

  async sharePostByEmail(input: SharePostByEmailInput): Promise<SharePostByEmailResult> {
    const normalized = normalizeShareInput(input, (value) => this.hashIdentifier(value));
    const fieldErrors = validateShare(normalized);

    if (Object.keys(fieldErrors).length > 0) {
      return {
        ok: false,
        status: "invalid",
        message: "Please check the email address.",
        fieldErrors,
      };
    }

    if (!(await this.repository.postExists(normalized.postSlug))) {
      return {
        ok: false,
        status: "not_found",
        message: "That post could not be found.",
      };
    }

    const moderationInput = shareModerationInput(normalized, this.now());
    const rateLimit = await this.checkRateLimit(
      "share_email",
      moderationInput,
      this.emailShareRateLimit,
    );

    if (rateLimit.limited) {
      return {
        ok: false,
        status: "rate_limited",
        message: "Please wait before sending more shares.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      };
    }

    if (shareTimingDecision(normalized, moderationInput)) {
      await this.repository.storeShare({
        postSlug: normalized.postSlug,
        channel: "email",
        actor: normalized.actor,
        requestContext: shareRequestContext(normalized, (value) => this.hashIdentifier(value)),
        now: this.now(),
      });

      return {
        ok: true,
        status: "recorded",
        message: "Thanks, the share was recorded.",
      };
    }

    const stored = await this.repository.storeShare({
      postSlug: normalized.postSlug,
      channel: "email",
      actor: normalized.actor,
      requestContext: shareRequestContext(normalized, (value) => this.hashIdentifier(value)),
      now: this.now(),
    });

    if (!stored) {
      return {
        ok: false,
        status: "not_found",
        message: "That post could not be found.",
      };
    }

    if (!normalized.emailProvider || !normalized.publicationId) {
      return {
        ok: true,
        status: "recorded",
        message: "Share recorded. Email delivery will attach when the provider is configured.",
      };
    }

    const recipientEmailHash = this.hashIdentifier(normalized.recipientEmail);
    const actorHash = actorRateLimitKey(normalized.actor);

    try {
      await normalized.emailProvider.sendTransactional({
        publicationId: normalized.publicationId,
        purpose: "custom",
        intent: {
          id: `share_${normalized.postSlug}_${Date.now()}`,
          dedupeKey: `share:${normalized.postSlug}:${actorHash}:${recipientEmailHash}`,
        },
        to: { email: normalized.recipientEmail },
        content: {
          subject: `${normalized.senderName || "A reader"} shared ${normalized.postTitle}`,
          text: `${normalized.senderName || "A reader"} thought you might like this post:\n\n${normalized.postTitle}\n${normalized.postUrl}`,
        },
        metadata: {
          postSlug: normalized.postSlug,
          channel: "email",
        },
      });
    } catch {
      return {
        ok: false,
        status: "provider_failed",
        message: "The share was recorded, but the email provider did not accept it.",
      };
    }

    return {
      ok: true,
      status: "queued",
      message: "Email queued.",
    };
  }

  private async checkRateLimit(
    action: string,
    input: EngagementModerationInput,
    limit: { windowSeconds: number; maxAttempts: number },
  ) {
    if (this.scopedRateLimitStore) {
      const scopedDecision = createScopedRateLimitCheck({
        action,
        windowMs: limit.windowSeconds * 1000,
        maxAttempts: limit.maxAttempts,
        store: this.scopedRateLimitStore,
      }).decide(input) as RateLimitDecision | undefined;

      if (scopedDecision?.outcome === "block") {
        return {
          limited: true as const,
          retryAfterSeconds: scopedDecision.retryAfterSeconds ?? limit.windowSeconds,
        };
      }
    }

    const actorScope = actorRateLimitScope(input);
    const postScope = input.postSlug ? { postSlug: input.postSlug } : undefined;

    if (!hasRateLimitScope(actorScope) && !postScope) {
      return { limited: false as const };
    }

    const now = this.now();
    const since = new Date(now.getTime() - limit.windowSeconds * 1000);
    const attemptScope: EngagementRateLimitScope = {
      ...actorScope,
      ...(input.postSlug ? { postSlug: input.postSlug } : {}),
    };

    await this.repository.recordRateLimitAttempt({
      action,
      scope: attemptScope,
      now,
    });

    const actorCount = hasRateLimitScope(actorScope)
      ? await this.repository.countRecentRateLimitAttempts(action, actorScope, since)
      : 0;

    if (actorCount > limit.maxAttempts) {
      return {
        limited: true as const,
        retryAfterSeconds: limit.windowSeconds,
      };
    }

    if (postScope) {
      const postCount = await this.repository.countRecentRateLimitAttempts(action, postScope, since);
      if (postCount > postRateLimitMaxAttempts(limit.maxAttempts)) {
        return {
          limited: true as const,
          retryAfterSeconds: limit.windowSeconds,
        };
      }
    }

    return { limited: false as const };
  }

  private hashIdentifier(value: string) {
    return createHmac("sha256", this.identifierHashSalt).update(value).digest("hex");
  }
}

function normalizeCommentInput(
  input: CommentSubmissionInput,
  hashIdentifier: HashIdentifier,
): CommentSubmissionInput {
  const email = input.email.trim().toLowerCase();
  const baseRequestContext = sanitizeEngagementRequestContext(input.requestContext);
  const honeypotFilled =
    Boolean(input.honeypot?.trim()) || Boolean(baseRequestContext?.honeypotFilled);

  return {
    ...input,
    postSlug: input.postSlug.trim(),
    body: input.body.trim(),
    name: input.name.trim(),
    email,
    website: input.website?.trim(),
    honeypot: input.honeypot?.trim(),
    requestContext: sanitizeEngagementRequestContext({
      ...baseRequestContext,
      anonymousActorHash: input.actor.anonymousActorHash,
      ...(honeypotFilled ? { honeypotFilled: true } : {}),
      emailHash: email ? hashIdentifier(email) : baseRequestContext?.emailHash,
    }),
  };
}

function validateComment(input: CommentSubmissionInput) {
  const errors: Record<string, string> = {};

  if (!input.body) errors.body = "Comment body is required.";
  if (input.body.length > 2_000) errors.body = "Please keep comments under 2,000 characters.";
  if (!input.name) errors.name = "Name is required.";
  if (!input.email || !emailPattern.test(input.email)) errors.email = "A valid email is required.";

  return errors;
}

function commentDecisions(
  input: CommentSubmissionInput,
  moderationInput: ModerationCheckInput,
): ModerationDecision[] {
  const decisions: ModerationDecision[] = [];
  const timingDecision = honeypotTimingCheck.decide(moderationInput);
  const lowerBody = input.body.toLowerCase();
  const linkCount = (input.body.match(/https?:\/\//gi) ?? []).length;
  const signals: string[] = [];

  if (timingDecision) {
    decisions.push(timingDecision);
  }

  if (input.honeypot) {
    signals.push("honeypot");
  }

  if (linkCount >= 3) {
    signals.push("link_volume");
  }

  if (blockedPhrases.some((phrase) => lowerBody.includes(phrase))) {
    signals.push("blocked_phrase");
  }

  if (signals.includes("honeypot") || signals.includes("blocked_phrase")) {
    decisions.push({
      source: "spam",
      outcome: "block",
      reason: "spam_signals",
      signals,
    });
  } else if (signals.length > 0 || input.website) {
    decisions.push({
      source: "spam",
      outcome: "suspicious",
      reason: "needs_review",
      signals,
    });
  }

  return decisions;
}

function normalizeShareInput(
  input: SharePostByEmailInput,
  hashIdentifier: HashIdentifier,
): SharePostByEmailInput {
  const recipientEmail = input.recipientEmail.trim().toLowerCase();
  const baseRequestContext = sanitizeEngagementRequestContext(input.requestContext);
  const honeypotFilled =
    Boolean(input.honeypot?.trim()) || Boolean(baseRequestContext?.honeypotFilled);

  return {
    ...input,
    postSlug: input.postSlug.trim(),
    recipientEmail,
    senderName: input.senderName?.trim(),
    honeypot: input.honeypot?.trim(),
    requestContext: sanitizeEngagementRequestContext({
      ...baseRequestContext,
      anonymousActorHash: input.actor.anonymousActorHash,
      ...(honeypotFilled ? { honeypotFilled: true } : {}),
      emailHash: recipientEmail ? hashIdentifier(recipientEmail) : baseRequestContext?.emailHash,
    }),
  };
}

function validateShare(input: SharePostByEmailInput) {
  const errors: Record<string, string> = {};

  if (!input.recipientEmail || !emailPattern.test(input.recipientEmail)) {
    errors.recipientEmail = "A valid recipient email is required.";
  }

  return errors;
}

function actorRateLimitKey(actor: EngagementActor) {
  return actor.kind === "registered_user" ? actor.userId : actor.anonymousActorHash;
}

function registeredUserId(actor: EngagementActor) {
  return actor.kind === "registered_user" ? actor.userId : undefined;
}

function actorRateLimitScope(input: EngagementModerationInput): EngagementRateLimitScope {
  return {
    anonymousActorHash: input.requestContext?.anonymousActorHash,
    ipHash: input.requestContext?.ipHash,
    emailHash: input.requestContext?.emailHash,
    registeredUserId: input.registeredUserId,
  };
}

function hasRateLimitScope(scope: EngagementRateLimitScope) {
  return Boolean(
    scope.anonymousActorHash ||
      scope.ipHash ||
      scope.emailHash ||
      scope.registeredUserId,
  );
}

function postRateLimitMaxAttempts(maxAttempts: number) {
  return maxAttempts * 20;
}

function resolveIdentifierHashSalt(configuredSalt: string | undefined) {
  const salt = configuredSalt ?? process.env.ENGAGEMENT_HASH_SALT;

  if (salt) {
    return salt;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("ENGAGEMENT_HASH_SALT is required in production.");
  }

  return defaultIdentifierHashSalt;
}

function shareRequestContext(input: SharePostByEmailInput, hashIdentifier: HashIdentifier) {
  return sanitizeEngagementRequestContext({
    ...input.requestContext,
    recipientEmailHash: hashIdentifier(input.recipientEmail),
  });
}

function commentModerationInput(
  input: CommentSubmissionInput,
  submittedAt: Date,
): ModerationCheckInput {
  return {
    postSlug: input.postSlug,
    body: input.body,
    commenterName: input.name,
    commenterEmail: input.email,
    commenterWebsite: input.website,
    registeredUserId: registeredUserId(input.actor),
    submittedAt,
    requestContext: input.requestContext,
  };
}

function shareModerationInput(
  input: SharePostByEmailInput,
  submittedAt: Date,
): ModerationCheckInput {
  return {
    postSlug: input.postSlug,
    body: "",
    commenterName: input.senderName ?? "",
    commenterEmail: input.recipientEmail,
    registeredUserId: registeredUserId(input.actor),
    submittedAt,
    requestContext: input.requestContext,
  };
}

function shareTimingDecision(
  input: SharePostByEmailInput,
  moderationInput: ModerationCheckInput,
) {
  return Boolean(input.honeypot || honeypotTimingCheck.decide(moderationInput));
}

function sanitizeEngagementRequestContext(
  context: EngagementRequestContext | undefined,
): EngagementRequestContext | undefined {
  if (!context) {
    return undefined;
  }

  const sanitized: EngagementRequestContext = {};

  if (typeof context.anonymousActorHash === "string" && context.anonymousActorHash) {
    sanitized.anonymousActorHash = context.anonymousActorHash;
  }
  if (typeof context.ipHash === "string" && context.ipHash) {
    sanitized.ipHash = context.ipHash;
  }
  if (typeof context.emailHash === "string" && context.emailHash) {
    sanitized.emailHash = context.emailHash;
  }
  if (typeof context.recipientEmailHash === "string" && context.recipientEmailHash) {
    sanitized.recipientEmailHash = context.recipientEmailHash;
  }
  if (typeof context.userAgentHash === "string" && context.userAgentHash) {
    sanitized.userAgentHash = context.userAgentHash;
  }
  if (typeof context.sessionIdHash === "string" && context.sessionIdHash) {
    sanitized.sessionIdHash = context.sessionIdHash;
  }
  if (typeof context.formAgeMs === "number") {
    sanitized.formAgeMs = context.formAgeMs;
  }
  if (context.honeypotFilled === true) {
    sanitized.honeypotFilled = true;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}
