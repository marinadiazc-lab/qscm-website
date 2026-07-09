import type { CommentId, CommentRecord } from "./types";
import type { ModerationStatus } from "../moderation";

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
  ): CommentRecord | undefined;
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
  ): CommentRecord | undefined {
    const comment = this.comments.get(id);

    if (!comment) {
      return undefined;
    }

    const updated: CommentRecord = {
      ...comment,
      moderationStatus: status,
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
