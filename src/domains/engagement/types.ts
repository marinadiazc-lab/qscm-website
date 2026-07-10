import type { EmailProvider } from "../email";
import type { ModerationAuditEntry, ModerationRequestContext, ModerationStatus } from "../moderation";

export type EngagementActor =
  | {
      kind: "anonymous";
      anonymousActorHash: string;
    }
  | {
      kind: "registered_user";
      userId: string;
      anonymousActorHash?: string;
    };

export type EngagementRequestContext = ModerationRequestContext & {
  anonymousActorHash?: string;
  recipientEmailHash?: string;
};

export type EngagementPostMetadata = {
  slug: string;
  sourcePath: string;
  sourceHash: string;
  title: string;
  excerpt: string;
  author: string;
  status: "draft" | "published";
  visibility: "public" | "free_subscribers" | "paid_any" | "specific_tiers";
  canonicalUrl?: string;
  publishedAt?: Date;
  updatedAt?: Date;
  tags: string[];
};

export type EngagementComment = {
  id: string;
  postSlug: string;
  body: string;
  commenter: {
    kind: "anonymous" | "registered_user";
    displayName: string;
  };
  moderationStatus: ModerationStatus;
  createdAt: Date;
  publishedAt?: Date;
};

export type ModerationQueueItem = EngagementComment & {
  privateFields: {
    email?: string;
    website?: string;
    registeredUserId?: string;
  };
  moderationAudit: ModerationAuditEntry[];
  requestContext?: EngagementRequestContext;
};

export type EngagementSummary = {
  postSlug: string;
  likeCount: number;
  viewerHasLiked: boolean;
  comments: EngagementComment[];
  commentCount: number;
};

export type CommentSubmissionInput = {
  postSlug: string;
  body: string;
  name: string;
  email: string;
  website?: string;
  honeypot?: string;
  actor: EngagementActor;
  requestContext?: EngagementRequestContext;
};

export type CommentSubmissionResult =
  | {
      ok: true;
      status: "published" | "held" | "blocked";
      comment?: EngagementComment;
      message: string;
    }
  | {
      ok: false;
      status: "invalid" | "not_found" | "rate_limited";
      message: string;
      fieldErrors?: Record<string, string>;
      retryAfterSeconds?: number;
    };

export type LikePostInput = {
  postSlug: string;
  actor: EngagementActor;
  requestContext?: EngagementRequestContext;
};

export type LikePostResult =
  | {
      ok: true;
      liked: boolean;
      likeCount: number;
    }
  | {
      ok: false;
      status: "not_found" | "rate_limited";
      message: string;
      retryAfterSeconds?: number;
    };

export type SharePostByEmailInput = {
  postSlug: string;
  recipientEmail: string;
  senderName?: string;
  honeypot?: string;
  postTitle: string;
  postUrl: string;
  actor: EngagementActor;
  requestContext?: EngagementRequestContext;
  emailProvider?: EmailProvider;
  publicationId?: string;
};

export type SharePostByEmailResult =
  | {
      ok: true;
      status: "queued" | "recorded";
      message: string;
    }
  | {
      ok: false;
      status: "invalid" | "not_found" | "rate_limited" | "provider_failed";
      message: string;
      fieldErrors?: Record<string, string>;
      retryAfterSeconds?: number;
    };

export type ShareChannel = "copy_link" | "email" | "facebook" | "linkedin" | "x" | "other";
