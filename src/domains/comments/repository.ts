import type { CommentId, CommentRecord } from "./types";
import type {
  ManualModerationDecision,
  ModerationDecisionOutcome,
  ModerationStatus,
  SystemModerationDecision,
} from "../moderation";

export interface ListCommentsOptions {
  status?: ModerationStatus;
}

export interface CommentRepository {
  save(comment: CommentRecord): CommentRecord;
  findById(id: CommentId): CommentRecord | undefined;
  listByPost(postSlug: string, options?: ListCommentsOptions): CommentRecord[];
  listByStatus(status: ModerationStatus): CommentRecord[];
  updateModerationStatus(
    id: CommentId,
    status: ModerationStatus,
    reviewedAt: Date,
    reviewer?: ModerationReviewer,
  ): CommentRecord | undefined;
}

export interface ModerationReviewer {
  moderatorId?: string;
  reason?: string;
}

export class InMemoryCommentRepository implements CommentRepository {
  private readonly comments = new Map<CommentId, CommentRecord>();

  constructor(seedComments: readonly CommentRecord[] = []) {
    seedComments.forEach((comment) => {
      this.comments.set(comment.id, cloneComment(comment));
    });
  }

  save(comment: CommentRecord): CommentRecord {
    const stored = cloneComment(comment);
    this.comments.set(stored.id, stored);
    return cloneComment(stored);
  }

  findById(id: CommentId): CommentRecord | undefined {
    const comment = this.comments.get(id);

    return comment ? cloneComment(comment) : undefined;
  }

  listByPost(
    postSlug: string,
    options: ListCommentsOptions = {},
  ): CommentRecord[] {
    return Array.from(this.comments.values())
      .filter((comment) => comment.postSlug === postSlug)
      .filter(
        (comment) => !options.status || comment.moderationStatus === options.status,
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(cloneComment);
  }

  listByStatus(status: ModerationStatus): CommentRecord[] {
    return Array.from(this.comments.values())
      .filter((comment) => comment.moderationStatus === status)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(cloneComment);
  }

  updateModerationStatus(
    id: CommentId,
    status: ModerationStatus,
    reviewedAt: Date,
    reviewer: ModerationReviewer = {},
  ): CommentRecord | undefined {
    const comment = this.comments.get(id);

    if (!comment) {
      return undefined;
    }

    const updated: CommentRecord = {
      ...comment,
      moderationStatus: status,
      moderationAudit: [
        ...comment.moderationAudit,
        {
          checkedAt: reviewedAt,
          decision: moderationTransitionDecision(status, reviewer),
        },
      ],
      updatedAt: reviewedAt,
      publishedAt: status === "approved" ? comment.publishedAt ?? reviewedAt : undefined,
    };

    this.comments.set(id, cloneComment(updated));
    return cloneComment(updated);
  }

  clear() {
    this.comments.clear();
  }
}

function moderationTransitionDecision(
  status: ModerationStatus,
  reviewer: ModerationReviewer,
): ManualModerationDecision | SystemModerationDecision {
  const outcome = moderationOutcomeForStatus(status);
  const reason =
    reviewer.reason ?? `Comment moderation status changed to ${status}.`;

  if (reviewer.moderatorId) {
    return {
      source: "manual",
      outcome,
      reason,
      moderatorId: reviewer.moderatorId,
      metadata: {
        status,
      },
    };
  }

  return {
    source: "system",
    outcome,
    reason,
    metadata: {
      status,
    },
  };
}

function moderationOutcomeForStatus(
  status: ModerationStatus,
): ModerationDecisionOutcome {
  if (status === "approved") {
    return "allow";
  }

  if (status === "suspicious") {
    return "suspicious";
  }

  return "block";
}

function cloneComment(comment: CommentRecord): CommentRecord {
  return {
    ...comment,
    commenter: { ...comment.commenter },
    privateFields: { ...comment.privateFields },
    requestContext: comment.requestContext
      ? { ...comment.requestContext }
      : undefined,
    moderationAudit: comment.moderationAudit.map((entry) => ({
      checkedAt: new Date(entry.checkedAt),
      decision: {
        ...entry.decision,
        metadata: entry.decision.metadata
          ? { ...entry.decision.metadata }
          : undefined,
      },
    })),
    createdAt: new Date(comment.createdAt),
    updatedAt: new Date(comment.updatedAt),
    publishedAt: comment.publishedAt ? new Date(comment.publishedAt) : undefined,
  };
}
