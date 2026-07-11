export type ModerationStatus =
  | "approved"
  | "suspicious"
  | "blocked"
  | "removed";

export type ModerationDecisionOutcome = "allow" | "suspicious" | "block";

export type ModerationDecisionSource =
  | "spam"
  | "rate_limit"
  | "ai"
  | "manual"
  | "system";

export type ModerationDecisionMetadata = Record<
  string,
  string | number | boolean | null
>;

export interface BaseModerationDecision {
  source: ModerationDecisionSource;
  outcome: ModerationDecisionOutcome;
  reason?: string;
  score?: number;
  metadata?: ModerationDecisionMetadata;
}

export interface SpamDecision extends BaseModerationDecision {
  source: "spam";
  signals?: readonly string[];
}

export interface RateLimitDecision extends BaseModerationDecision {
  source: "rate_limit";
  limitKey?: string;
  limit?: number;
  remaining?: number;
  retryAfterSeconds?: number;
}

export type AIModerationCategory =
  | "spam"
  | "harassment"
  | "hate"
  | "sexual"
  | "violence"
  | "self_harm"
  | "pii"
  | "other";

export interface AIModerationDecision extends BaseModerationDecision {
  source: "ai";
  provider: string;
  model?: string;
  categories?: readonly AIModerationCategory[];
  confidence?: number;
}

export interface ManualModerationDecision extends BaseModerationDecision {
  source: "manual";
  moderatorId?: string;
}

export interface SystemModerationDecision extends BaseModerationDecision {
  source: "system";
}

export type ModerationDecision =
  | SpamDecision
  | RateLimitDecision
  | AIModerationDecision
  | ManualModerationDecision
  | SystemModerationDecision;

export interface ModerationAuditEntry {
  decision: ModerationDecision;
  checkedAt: Date;
}

export interface ModerationRequestContext {
  ipHash?: string;
  emailHash?: string;
  userAgentHash?: string;
  sessionIdHash?: string;
  formAgeMs?: number;
  honeypotFilled?: boolean;
}

export interface ModerationCheckInput {
  postSlug: string;
  body: string;
  commenterName: string;
  commenterEmail?: string;
  commenterWebsite?: string;
  registeredUserId?: string;
  submittedAt: Date;
  requestContext?: ModerationRequestContext;
}

export type ModerationCheckFunction = (
  input: ModerationCheckInput,
) => ModerationDecision | undefined;

export interface ModerationCheck {
  name: string;
  decide: ModerationCheckFunction;
}

export interface AIModerationInput {
  commentId?: string;
  postSlug: string;
  body: string;
  commenterName: string;
  submittedAt: Date;
}

export interface AIModerationHook {
  provider: string;
  moderate(input: AIModerationInput): Promise<AIModerationDecision>;
}
