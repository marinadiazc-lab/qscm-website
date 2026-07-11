import {
  isPublicModerationStatus,
  moderationStatusForDecisions,
  toModerationAuditEntries,
  type ModerationCheck,
  type ModerationCheckFunction,
  type ModerationCheckInput,
  type ModerationDecision,
} from "../moderation";
import type { CommentRepository } from "./repository";
import type {
  CommentId,
  CommentPrivateFields,
  CommentRecord,
  CreateCommentError,
  CreateCommentInput,
  CreateCommentResult,
  PublicCommenterIdentity,
  PublicImmediateComment,
} from "./types";

export type CommentIdFactory = () => CommentId;
export type Clock = () => Date;

export interface BuildCommentOptions {
  id: CommentId;
  now: Date;
  checks?: readonly (ModerationCheck | ModerationCheckFunction)[];
}

export interface CommentServiceOptions {
  idFactory?: CommentIdFactory;
  clock?: Clock;
  checks?: readonly (ModerationCheck | ModerationCheckFunction)[];
}

export class CommentService {
  private readonly idFactory: CommentIdFactory;
  private readonly clock: Clock;
  private readonly checks: readonly (ModerationCheck | ModerationCheckFunction)[];

  constructor(
    private readonly repository: CommentRepository,
    options: CommentServiceOptions = {},
  ) {
    this.idFactory = options.idFactory ?? defaultIdFactory;
    this.clock = options.clock ?? (() => new Date());
    this.checks = options.checks ?? [];
  }

  create(input: CreateCommentInput): CreateCommentResult {
    const result = buildComment(input, {
      id: this.idFactory(),
      now: this.clock(),
      checks: this.checks,
    });

    if (!result.ok) {
      return result;
    }

    const comment = this.repository.save(result.comment);

    return {
      ok: true,
      comment,
      publicComment: toPublicImmediateComment(comment),
    };
  }

  listPublicByPost(postSlug: string): PublicImmediateComment[] {
    return this.repository
      .listByPost(postSlug, { status: "approved" })
      .map(toPublicImmediateComment)
      .filter((comment): comment is PublicImmediateComment => Boolean(comment));
  }

  listSuspiciousQueue(): CommentRecord[] {
    return this.repository.listByStatus("suspicious");
  }
}

export function buildComment(
  input: CreateCommentInput,
  options: BuildCommentOptions,
): CreateCommentResult {
  const normalizedInput = normalizeCreateCommentInput(input);
  const errors = validateCreateCommentInput(normalizedInput);

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
    };
  }

  const moderationInput = toModerationInput(normalizedInput, options.now);
  const decisions = runModerationChecks(moderationInput, options.checks ?? []);
  const moderationStatus = moderationStatusForDecisions(decisions);
  const publishedAt = isPublicModerationStatus(moderationStatus)
    ? options.now
    : undefined;
  const comment: CommentRecord = {
    id: options.id,
    postSlug: normalizedInput.postSlug,
    body: normalizedInput.body,
    commenter: toPublicCommenterIdentity(normalizedInput.commenter),
    privateFields: toPrivateFields(normalizedInput.commenter),
    moderationStatus,
    moderationAudit: toModerationAuditEntries(decisions, options.now),
    requestContext: toStoredModerationRequestContext(normalizedInput.requestContext),
    createdAt: options.now,
    updatedAt: options.now,
    publishedAt,
  };

  return {
    ok: true,
    comment,
    publicComment: toPublicImmediateComment(comment),
  };
}

export function toPublicImmediateComment(
  comment: CommentRecord,
): PublicImmediateComment | undefined {
  if (!isPublicModerationStatus(comment.moderationStatus)) {
    return undefined;
  }

  return {
    id: comment.id,
    postSlug: comment.postSlug,
    body: comment.body,
    commenter: { ...comment.commenter },
    moderationStatus: "approved",
    publicationMode: "public_immediate",
    createdAt: comment.createdAt,
    publishedAt: comment.publishedAt ?? comment.createdAt,
  };
}

export function runModerationChecks(
  input: ModerationCheckInput,
  checks: readonly (ModerationCheck | ModerationCheckFunction)[],
): ModerationDecision[] {
  return checks.flatMap((check) => {
    const decision =
      typeof check === "function" ? check(input) : check.decide(input);

    return decision ? [decision] : [];
  });
}

function normalizeCreateCommentInput(input: CreateCommentInput): CreateCommentInput {
  return {
    ...input,
    postSlug: input.postSlug.trim(),
    body: input.body.trim(),
    commenter:
      input.commenter.kind === "anonymous"
        ? {
            ...input.commenter,
            name: input.commenter.name.trim(),
            email: input.commenter.email.trim().toLowerCase(),
            website: input.commenter.website?.trim(),
          }
        : {
            ...input.commenter,
            userId: input.commenter.userId.trim(),
            displayName: input.commenter.displayName.trim(),
            email: input.commenter.email?.trim().toLowerCase(),
          },
  };
}

function validateCreateCommentInput(
  input: CreateCommentInput,
): CreateCommentError[] {
  const errors: CreateCommentError[] = [];

  if (!input.postSlug) {
    errors.push({
      code: "missing_post",
      field: "postSlug",
      message: "A post is required before creating a comment.",
    });
  }

  if (!input.body) {
    errors.push({
      code: "missing_body",
      field: "body",
      message: "Comment body is required.",
    });
  }

  if (input.commenter.kind === "anonymous") {
    if (!input.commenter.name) {
      errors.push({
        code: "missing_name",
        field: "commenter.name",
        message: "A display name is required for anonymous comments.",
      });
    }

    if (!input.commenter.email) {
      errors.push({
        code: "missing_email",
        field: "commenter.email",
        message: "An email is required for anonymous comments.",
      });
    }
  }

  if (input.commenter.kind === "registered_user") {
    if (!input.commenter.userId) {
      errors.push({
        code: "missing_user",
        field: "userId",
        message: "A registered user id is required for user comments.",
      });
    }

    if (!input.commenter.displayName) {
      errors.push({
        code: "missing_name",
        field: "commenter.name",
        message: "A display name is required for user comments.",
      });
    }
  }

  return errors;
}

function toModerationInput(
  input: CreateCommentInput,
  submittedAt: Date,
): ModerationCheckInput {
  return {
    postSlug: input.postSlug,
    body: input.body,
    commenterName:
      input.commenter.kind === "anonymous"
        ? input.commenter.name
        : input.commenter.displayName,
    commenterEmail: input.commenter.email,
    commenterWebsite:
      input.commenter.kind === "anonymous" ? input.commenter.website : undefined,
    registeredUserId:
      input.commenter.kind === "registered_user"
        ? input.commenter.userId
        : undefined,
    submittedAt,
    requestContext: input.requestContext,
  };
}

function toPublicCommenterIdentity(
  commenter: CreateCommentInput["commenter"],
): PublicCommenterIdentity {
  return {
    kind: commenter.kind,
    displayName:
      commenter.kind === "anonymous" ? commenter.name : commenter.displayName,
  };
}

function toPrivateFields(
  commenter: CreateCommentInput["commenter"],
): CommentPrivateFields {
  if (commenter.kind === "anonymous") {
    return {
      email: commenter.email,
      website: commenter.website,
    };
  }

  return {
    email: commenter.email,
    registeredUserId: commenter.userId,
  };
}

function toStoredModerationRequestContext(
  context: CreateCommentInput["requestContext"],
): CreateCommentInput["requestContext"] {
  if (!context) {
    return undefined;
  }

  return {
    ipHash: context.ipHash,
    emailHash: context.emailHash,
    userAgentHash: context.userAgentHash,
    sessionIdHash: context.sessionIdHash,
    formAgeMs:
      typeof context.formAgeMs === "number" && Number.isFinite(context.formAgeMs)
        ? context.formAgeMs
        : undefined,
    honeypotFilled: context.honeypotFilled ? true : undefined,
  };
}

function defaultIdFactory(): CommentId {
  return `comment_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}
