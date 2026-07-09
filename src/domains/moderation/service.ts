import type {
  ModerationAuditEntry,
  ModerationDecision,
  ModerationDecisionOutcome,
  ModerationStatus,
} from "./types";

const outcomePriority: Record<ModerationDecisionOutcome, number> = {
  allow: 0,
  suspicious: 1,
  block: 2,
};

export function mostRestrictiveOutcome(
  decisions: readonly ModerationDecision[],
): ModerationDecisionOutcome {
  return decisions.reduce<ModerationDecisionOutcome>(
    (current, decision) =>
      outcomePriority[decision.outcome] > outcomePriority[current]
        ? decision.outcome
        : current,
    "allow",
  );
}

export function moderationStatusForDecisions(
  decisions: readonly ModerationDecision[],
): ModerationStatus {
  const outcome = mostRestrictiveOutcome(decisions);

  if (outcome === "block") {
    return "blocked";
  }

  if (outcome === "suspicious") {
    return "suspicious";
  }

  return "approved";
}

export function toModerationAuditEntries(
  decisions: readonly ModerationDecision[],
  checkedAt: Date,
): ModerationAuditEntry[] {
  return decisions.map((decision) => ({
    decision,
    checkedAt,
  }));
}

export function isPublicModerationStatus(
  status: ModerationStatus,
): status is "approved" {
  return status === "approved";
}
