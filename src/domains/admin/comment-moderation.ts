import type {
  ModerationDecisionOutcome,
  ModerationStatus,
} from "../moderation";

export const adminCommentModerationActions = [
  "approve",
  "reject",
  "delete",
] as const;

export type AdminCommentModerationAction =
  (typeof adminCommentModerationActions)[number];

export type AdminCommentModerationTransition = {
  status: ModerationStatus;
  outcome: ModerationDecisionOutcome;
  reason: string;
  publishesComment: boolean;
  removesComment: boolean;
};

export function parseAdminCommentModerationAction(
  value: FormDataEntryValue | string | null | undefined,
): AdminCommentModerationAction | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return adminCommentModerationActions.find((action) => action === value);
}

export function adminCommentModerationTransition(
  action: AdminCommentModerationAction,
): AdminCommentModerationTransition {
  if (action === "approve") {
    return {
      status: "approved",
      outcome: "allow",
      reason: "Moderator approved the comment.",
      publishesComment: true,
      removesComment: false,
    };
  }

  if (action === "reject") {
    return {
      status: "blocked",
      outcome: "block",
      reason: "Moderator rejected the comment.",
      publishesComment: false,
      removesComment: true,
    };
  }

  return {
    status: "removed",
    outcome: "block",
    reason: "Moderator deleted the comment.",
    publishesComment: false,
    removesComment: true,
  };
}
