import "server-only";

import { and, eq } from "drizzle-orm";

import { db, schema } from "@/src/db";
import {
  adminCommentModerationTransition,
  type AdminCommentModerationAction,
} from "./comment-moderation";

export type ModerateAdminCommentInput = {
  publicationId: string;
  commentId: string;
  action: AdminCommentModerationAction;
  moderatorId: string;
};

export type ModerateAdminCommentResult =
  | {
      ok: true;
      commentId: string;
      status: string;
    }
  | {
      ok: false;
      status: 404;
      error: string;
    };

export async function moderateAdminComment(
  input: ModerateAdminCommentInput,
): Promise<ModerateAdminCommentResult> {
  const transition = adminCommentModerationTransition(input.action);
  const now = new Date();
  const [comment] = await db
    .select({
      id: schema.comments.id,
    })
    .from(schema.comments)
    .innerJoin(schema.postMetadata, eq(schema.comments.postId, schema.postMetadata.id))
    .where(
      and(
        eq(schema.comments.id, input.commentId),
        eq(schema.postMetadata.publicationId, input.publicationId),
      ),
    )
    .limit(1);

  if (!comment) {
    return {
      ok: false,
      status: 404,
      error: "Comment was not found in this publication.",
    };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(schema.comments)
      .set({
        moderationStatus: transition.status,
        updatedAt: now,
        publishedAt: transition.publishesComment ? now : null,
        removedAt: transition.removesComment ? now : null,
      })
      .where(eq(schema.comments.id, input.commentId));

    await tx.insert(schema.moderationAuditEntries).values({
      commentId: input.commentId,
      source: "manual",
      outcome: transition.outcome,
      reason: transition.reason,
      decision: {
        action: input.action,
        status: transition.status,
        moderatorId: input.moderatorId,
      },
      checkedAt: now,
    });
  });

  return {
    ok: true,
    commentId: input.commentId,
    status: transition.status,
  };
}
