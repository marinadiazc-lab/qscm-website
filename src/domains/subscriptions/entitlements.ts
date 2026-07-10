import type {
  EntitlementDecision,
  EntitlementKey,
  SubscriptionStatus,
  TierId,
} from "./types";

export type DateLike = Date | string | number;

export interface EntitlementPolicy {
  now?: DateLike;
  pastDueGracePeriodDays?: number;
}

export type StripeLikeSubscriptionStatus = Extract<
  SubscriptionStatus,
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused"
>;

export interface SubscriptionEntitlementState {
  status: SubscriptionStatus;
  tierId?: TierId;
  tierIds?: TierId[];
  entitlementKeys?: EntitlementKey[];
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: DateLike | null;
  trialEnd?: DateLike | null;
  accessEndsAt?: DateLike | null;
  statusChangedAt?: DateLike | null;
  scheduledTierChange?: SubscriptionTierChange | null;
}

export type SubscriptionTierChangeAccessPolicy = "immediate" | "period_end";

export interface SubscriptionTierChange {
  fromTierId?: TierId;
  toTierId: TierId;
  effectiveAt: DateLike;
  accessPolicy: SubscriptionTierChangeAccessPolicy;
}

export interface StripeLikeSubscriptionState extends Omit<SubscriptionEntitlementState, "status"> {
  status: StripeLikeSubscriptionStatus;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const DEFAULT_PAST_DUE_GRACE_PERIOD_DAYS = 7;

export function decideStripeLikeSubscriptionEntitlement(
  subscription: StripeLikeSubscriptionState | null | undefined,
  policy: EntitlementPolicy = {},
): EntitlementDecision {
  return decideSubscriptionEntitlement(subscription, policy);
}

export function decideSubscriptionEntitlement(
  subscription: SubscriptionEntitlementState | null | undefined,
  policy: EntitlementPolicy = {},
): EntitlementDecision {
  const checkedAt = toDate(policy.now) ?? new Date();

  if (!subscription) {
    return deny({
      reason: "missing_subscription",
      status: "none",
      checkedAt,
    });
  }

  const { entitlementKeys, tierId, tierIds } = getEntitlementContext(subscription, checkedAt);

  switch (subscription.status) {
    case "active":
      return decisionForOpenAccess({
        reason: subscription.cancelAtPeriodEnd
          ? "canceled_with_remaining_period"
          : "active_subscription",
        status: subscription.status,
        checkedAt,
        accessEndsAt: toDate(subscription.accessEndsAt) ?? toDate(subscription.currentPeriodEnd),
        tierId,
        tierIds,
        entitlementKeys,
      });
    case "trialing":
      return decisionForOpenAccess({
        reason: "trialing_subscription",
        status: subscription.status,
        checkedAt,
        accessEndsAt: toDate(subscription.accessEndsAt) ?? toDate(subscription.trialEnd),
        tierId,
        tierIds,
        entitlementKeys,
      });
    case "past_due":
    case "grace_period": {
      const gracePeriodEndsAt = getPastDueGracePeriodEnd(subscription, policy);

      return decisionForBoundedAccess({
        allowedReason: "past_due_grace_period",
        deniedReason: "payment_required",
        status: subscription.status,
        checkedAt,
        accessEndsAt: gracePeriodEndsAt,
        gracePeriodEndsAt,
        tierId,
        tierIds,
        entitlementKeys,
      });
    }
    case "canceled":
      return decisionForBoundedAccess({
        allowedReason: "canceled_with_remaining_period",
        deniedReason: "access_period_ended",
        status: subscription.status,
        checkedAt,
        accessEndsAt: toDate(subscription.accessEndsAt) ?? toDate(subscription.currentPeriodEnd),
        gracePeriodEndsAt: null,
        tierId,
        tierIds,
        entitlementKeys,
      });
    case "unpaid":
      return decisionForBoundedAccess({
        allowedReason: "unpaid_with_remaining_access",
        deniedReason: "payment_required",
        status: subscription.status,
        checkedAt,
        accessEndsAt: toDate(subscription.accessEndsAt) ?? toDate(subscription.currentPeriodEnd),
        gracePeriodEndsAt: null,
        tierId,
        tierIds,
        entitlementKeys,
      });
    case "comped":
      return allow({
        reason: "complimentary_access",
        status: subscription.status,
        checkedAt,
        accessEndsAt: toDate(subscription.accessEndsAt),
        gracePeriodEndsAt: null,
        tierId,
        tierIds,
        entitlementKeys,
      });
    case "free":
      return deny({
        reason: "free_subscription",
        status: subscription.status,
        checkedAt,
        tierId,
        tierIds,
        entitlementKeys,
      });
    case "incomplete":
    case "incomplete_expired":
      return deny({
        reason: "subscription_incomplete",
        status: subscription.status,
        checkedAt,
        tierId,
        tierIds,
        entitlementKeys,
      });
    case "paused":
      return deny({
        reason: "subscription_paused",
        status: subscription.status,
        checkedAt,
        tierId,
        tierIds,
        entitlementKeys,
      });
    case "expired":
      return deny({
        reason: "access_period_ended",
        status: subscription.status,
        checkedAt,
        accessEndsAt: toDate(subscription.accessEndsAt) ?? toDate(subscription.currentPeriodEnd),
        tierId,
        tierIds,
        entitlementKeys,
      });
    }
  }

function getEntitlementContext(subscription: SubscriptionEntitlementState, checkedAt: Date) {
  const baseTierIds = uniqueValues([
    subscription.tierId,
    ...(subscription.tierIds ?? []),
    ...(subscription.entitlementKeys ?? [])
      .filter((key) => key.startsWith("tier:"))
      .map((key) => key.slice("tier:".length)),
  ]);
  const scheduledTierId = getActiveScheduledTierId(subscription.scheduledTierChange, checkedAt);
  const tierIds = scheduledTierId ? uniqueValues([...baseTierIds, scheduledTierId]) : baseTierIds;
  const tierId = scheduledTierId ?? subscription.tierId ?? tierIds[0];
  const entitlementKeys = uniqueValues([
    ...(subscription.entitlementKeys ?? []),
    ...tierIds.map((id) => `tier:${id}` as EntitlementKey),
  ]);

  return {
    tierId,
    tierIds,
    entitlementKeys,
  };
}

function getActiveScheduledTierId(
  scheduledTierChange: SubscriptionTierChange | null | undefined,
  checkedAt: Date,
) {
  if (!scheduledTierChange) {
    return undefined;
  }

  const effectiveAt = toDate(scheduledTierChange.effectiveAt);

  if (!effectiveAt || isAfter(effectiveAt, checkedAt)) {
    return undefined;
  }

  return scheduledTierChange.toTierId;
}

export function getPastDueGracePeriodEnd(
  subscription: Pick<
    SubscriptionEntitlementState,
    "accessEndsAt" | "currentPeriodEnd" | "statusChangedAt"
  >,
  policy: EntitlementPolicy = {},
) {
  const explicitAccessEnd = toDate(subscription.accessEndsAt);

  if (explicitAccessEnd) {
    return explicitAccessEnd;
  }

  const graceStart = toDate(subscription.currentPeriodEnd) ?? toDate(subscription.statusChangedAt);

  if (!graceStart) {
    return null;
  }

  return addDays(graceStart, policy.pastDueGracePeriodDays ?? DEFAULT_PAST_DUE_GRACE_PERIOD_DAYS);
}

function decisionForOpenAccess(input: {
  reason: EntitlementDecision["reason"];
  status: SubscriptionStatus;
  checkedAt: Date;
  accessEndsAt: Date | null;
  tierId?: TierId;
  tierIds: TierId[];
  entitlementKeys: EntitlementKey[];
}) {
  if (input.accessEndsAt && isAfter(input.checkedAt, input.accessEndsAt)) {
    return deny({
      reason: "access_period_ended",
      status: input.status,
      checkedAt: input.checkedAt,
      accessEndsAt: input.accessEndsAt,
      tierId: input.tierId,
      tierIds: input.tierIds,
      entitlementKeys: input.entitlementKeys,
    });
  }

  return allow({
    reason: input.reason,
    status: input.status,
    checkedAt: input.checkedAt,
    accessEndsAt: input.accessEndsAt,
    gracePeriodEndsAt: null,
    tierId: input.tierId,
    tierIds: input.tierIds,
    entitlementKeys: input.entitlementKeys,
  });
}

function decisionForBoundedAccess(input: {
  allowedReason: EntitlementDecision["reason"];
  deniedReason: EntitlementDecision["reason"];
  status: SubscriptionStatus;
  checkedAt: Date;
  accessEndsAt: Date | null;
  gracePeriodEndsAt: Date | null;
  tierId?: TierId;
  tierIds: TierId[];
  entitlementKeys: EntitlementKey[];
}) {
  if (!input.accessEndsAt || isAfter(input.checkedAt, input.accessEndsAt)) {
    return deny({
      reason: input.deniedReason,
      status: input.status,
      checkedAt: input.checkedAt,
      accessEndsAt: input.accessEndsAt,
      gracePeriodEndsAt: input.gracePeriodEndsAt,
      tierId: input.tierId,
      tierIds: input.tierIds,
      entitlementKeys: input.entitlementKeys,
    });
  }

  return allow({
    reason: input.allowedReason,
    status: input.status,
    checkedAt: input.checkedAt,
    accessEndsAt: input.accessEndsAt,
    gracePeriodEndsAt: input.gracePeriodEndsAt,
    tierId: input.tierId,
    tierIds: input.tierIds,
    entitlementKeys: input.entitlementKeys,
  });
}

function allow(input: {
  reason: EntitlementDecision["reason"];
  status: EntitlementDecision["status"];
  checkedAt: Date;
  accessEndsAt: Date | null;
  gracePeriodEndsAt: Date | null;
  tierId?: TierId;
  tierIds: TierId[];
  entitlementKeys: EntitlementKey[];
}): EntitlementDecision {
  return {
    allowed: true,
    reason: input.reason,
    status: input.status,
    checkedAt: input.checkedAt,
    accessEndsAt: input.accessEndsAt,
    gracePeriodEndsAt: input.gracePeriodEndsAt,
    tierId: input.tierId,
    tierIds: input.tierIds,
    entitlementKeys: input.entitlementKeys,
  };
}

function deny(input: {
  reason: EntitlementDecision["reason"];
  status: EntitlementDecision["status"];
  checkedAt: Date;
  accessEndsAt?: Date | null;
  gracePeriodEndsAt?: Date | null;
  tierId?: TierId;
  tierIds?: TierId[];
  entitlementKeys?: EntitlementKey[];
}): EntitlementDecision {
  return {
    allowed: false,
    reason: input.reason,
    status: input.status,
    checkedAt: input.checkedAt,
    accessEndsAt: input.accessEndsAt ?? null,
    gracePeriodEndsAt: input.gracePeriodEndsAt ?? null,
    tierId: input.tierId,
    tierIds: input.tierIds ?? [],
    entitlementKeys: input.entitlementKeys ?? [],
  };
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function isAfter(left: Date, right: Date) {
  return left.getTime() > right.getTime();
}

function uniqueValues<T>(values: readonly (T | undefined)[]) {
  return Array.from(new Set(values.filter((value): value is T => value !== undefined)));
}

function toDate(value: DateLike | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}
