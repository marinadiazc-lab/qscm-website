export type BillingInterval = "month" | "year";

export type TierId = string;

export type TierPriceId = string;

export type EntitlementKey =
  | "paid_content"
  | "private_podcast"
  | `tier:${string}`
  | `addon:${string}`;

export type TierStatus = "active" | "archived";

export interface SubscriptionTier {
  id: TierId;
  publicationId: string;
  slug: string;
  name: string;
  description?: string;
  status: TierStatus;
  sortOrder: number;
  defaultGracePeriodDays: number;
  entitlementKeys: EntitlementKey[];
}

export interface TierPrice {
  id: TierPriceId;
  tierId: TierId;
  interval: BillingInterval;
  amountCents: number;
  currency: string;
  activeForCheckout: boolean;
  startsAt?: Date;
  endsAt?: Date;
}

export type SubscriptionStatus =
  | "free"
  | "trialing"
  | "active"
  | "past_due"
  | "grace_period"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused"
  | "expired"
  | "comped";

export type EntitlementDecisionReason =
  | "active_subscription"
  | "trialing_subscription"
  | "past_due_grace_period"
  | "canceled_with_remaining_period"
  | "unpaid_with_remaining_access"
  | "complimentary_access"
  | "free_subscription"
  | "access_period_ended"
  | "payment_required"
  | "subscription_incomplete"
  | "subscription_paused"
  | "missing_subscription";

export interface EntitlementDecision {
  allowed: boolean;
  reason: EntitlementDecisionReason;
  status: SubscriptionStatus | "none";
  checkedAt: Date;
  accessEndsAt: Date | null;
  gracePeriodEndsAt: Date | null;
  tierId?: TierId;
  tierIds: TierId[];
  entitlementKeys: EntitlementKey[];
}
