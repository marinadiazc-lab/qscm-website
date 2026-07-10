import {
  moderationStatusForDecisions,
  toModerationAuditEntries,
  type ModerationDecision,
} from "../moderation";
import type { EngagementRepository } from "./repository";
import type {
  CommentSubmissionInput,
  CommentSubmissionResult,
  EngagementActor,
  EngagementSummary,
  LikePostInput,
  LikePostResult,
  SharePostByEmailInput,
  SharePostByEmailResult,
} from "./types";

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
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const defaultCommentLimit = { windowSeconds: 10 * 60, maxAttempts: 5 };
const defaultLikeLimit = { windowSeconds: 60, maxAttempts: 20 };
const defaultEmailShareLimit = { windowSeconds: 60 * 60, maxAttempts: 3 };
const blockedPhrases = ["buy followers", "crypto giveaway", "free money", "casino bonus"];

export class EngagementService {
  private readonly now: () => Date;
  private readonly commentRateLimit: Required<EngagementServiceOptions>["commentRateLimit"];
  private readonly likeRateLimit: Required<EngagementServiceOptions>["likeRateLimit"];
  private readonly emailShareRateLimit: Required<EngagementServiceOptions>["emailShareRateLimit"];

  constructor(
    private readonly repository: EngagementRepository,
    options: EngagementServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.commentRateLimit = options.commentRateLimit ?? defaultCommentLimit;
    this.likeRateLimit = options.likeRateLimit ?? defaultLikeLimit;
    this.emailShareRateLimit = options.emailShareRateLimit ?? defaultEmailShareLimit;
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
    const normalized = normalizeCommentInput(input);
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

    const actorHash = actorRateLimitKey(normalized.actor);
    const rateLimit = await this.checkRateLimit(
      actorHash,
      this.commentRateLimit,
      (since) => this.repository.countRecentComments(actorHash, since),
    );

    if (rateLimit.limited) {
      return {
        ok: false,
        status: "rate_limited",
        message: "Please wait a bit before posting another comment.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      };
    }

    const decisions = commentDecisions(normalized);
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
    const actorHash = actorRateLimitKey(input.actor);
    const rateLimit = await this.checkRateLimit(
      actorHash,
      this.likeRateLimit,
      (since) => this.repository.countRecentLikes(actorHash, since),
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
    const normalized = normalizeShareInput(input);
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

    const actorHash = actorRateLimitKey(normalized.actor);
    const rateLimit = await this.checkRateLimit(
      actorHash,
      this.emailShareRateLimit,
      (since) => this.repository.countRecentShares(actorHash, since),
    );

    if (rateLimit.limited) {
      return {
        ok: false,
        status: "rate_limited",
        message: "Please wait before sending more shares.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      };
    }

    if (normalized.honeypot) {
      await this.repository.storeShare({
        postSlug: normalized.postSlug,
        channel: "email",
        actor: normalized.actor,
        requestContext: normalized.requestContext,
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
      requestContext: normalized.requestContext,
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

    try {
      await normalized.emailProvider.sendTransactional({
        publicationId: normalized.publicationId,
        purpose: "custom",
        intent: {
          id: `share_${normalized.postSlug}_${Date.now()}`,
          dedupeKey: `share:${normalized.postSlug}:${actorHash}:${normalized.recipientEmail}`,
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
    actorHash: string | undefined,
    limit: { windowSeconds: number; maxAttempts: number },
    countRecent: (since: Date) => Promise<number>,
  ) {
    if (!actorHash) {
      return { limited: false as const };
    }

    const now = this.now();
    const since = new Date(now.getTime() - limit.windowSeconds * 1000);
    const count = await countRecent(since);

    if (count >= limit.maxAttempts) {
      return {
        limited: true as const,
        retryAfterSeconds: limit.windowSeconds,
      };
    }

    return { limited: false as const };
  }
}

function normalizeCommentInput(input: CommentSubmissionInput): CommentSubmissionInput {
  return {
    ...input,
    postSlug: input.postSlug.trim(),
    body: input.body.trim(),
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    website: input.website?.trim(),
    honeypot: input.honeypot?.trim(),
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

function commentDecisions(input: CommentSubmissionInput): ModerationDecision[] {
  const decisions: ModerationDecision[] = [];
  const lowerBody = input.body.toLowerCase();
  const linkCount = (input.body.match(/https?:\/\//gi) ?? []).length;
  const signals: string[] = [];

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

function normalizeShareInput(input: SharePostByEmailInput): SharePostByEmailInput {
  return {
    ...input,
    postSlug: input.postSlug.trim(),
    recipientEmail: input.recipientEmail.trim().toLowerCase(),
    senderName: input.senderName?.trim(),
    honeypot: input.honeypot?.trim(),
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
