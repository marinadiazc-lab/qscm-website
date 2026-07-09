import type {
  ModerationAuditEntry,
  ModerationRequestContext,
  ModerationStatus,
} from "../moderation";

export type CommentId = string;
export type CommentAuthorKind = "anonymous" | "registered_user";

export interface AnonymousCommenterIdentity {
  kind: "anonymous";
  name: string;
  email: string;
  website?: string;
}

export interface RegisteredUserCommenterIdentity {
  kind: "registered_user";
  userId: string;
  displayName: string;
  email?: string;
}

export type CommenterIdentity =
  | AnonymousCommenterIdentity
  | RegisteredUserCommenterIdentity;

export interface PublicCommenterIdentity {
  kind: CommentAuthorKind;
  displayName: string;
}

export interface CommentPrivateFields {
  email?: string;
  website?: string;
  registeredUserId?: string;
}

export interface CommentRecord {
  id: CommentId;
  postSlug: string;
  body: string;
  commenter: PublicCommenterIdentity;
  privateFields: CommentPrivateFields;
  moderationStatus: ModerationStatus;
  moderationAudit: ModerationAuditEntry[];
  requestContext?: ModerationRequestContext;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
}

export type AnonymousComment = CommentRecord & {
  commenter: {
    kind: "anonymous";
    displayName: string;
  };
  privateFields: CommentPrivateFields & {
    email: string;
  };
};

export type RegisteredUserComment = CommentRecord & {
  commenter: {
    kind: "registered_user";
    displayName: string;
  };
  privateFields: CommentPrivateFields & {
    registeredUserId: string;
  };
};

export interface PublicImmediateComment {
  id: CommentId;
  postSlug: string;
  body: string;
  commenter: PublicCommenterIdentity;
  moderationStatus: "approved";
  publicationMode: "public_immediate";
  createdAt: Date;
  publishedAt: Date;
}

export interface CreateCommentInput {
  postSlug: string;
  body: string;
  commenter: CommenterIdentity;
  requestContext?: ModerationRequestContext;
}

export type CreateCommentErrorCode =
  | "missing_post"
  | "missing_body"
  | "missing_name"
  | "missing_email"
  | "missing_user";

export interface CreateCommentError {
  code: CreateCommentErrorCode;
  field: "postSlug" | "body" | "commenter.name" | "commenter.email" | "userId";
  message: string;
}

export type CreateCommentResult =
  | {
      ok: true;
      comment: CommentRecord;
      publicComment?: PublicImmediateComment;
    }
  | {
      ok: false;
      errors: CreateCommentError[];
    };
