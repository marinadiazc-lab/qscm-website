import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAST_DUE_GRACE_PERIOD_DAYS,
  decideSubscriptionEntitlement,
  getPastDueGracePeriodEnd,
} from "../src/domains/subscriptions";
import {
  derivePostAccessRequirement,
  derivePostAccessRequirementFromVisibility,
} from "../src/domains/content";

const now = new Date("2026-07-10T12:00:00.000Z");

describe("subscription entitlement decisions", () => {
  it("allows active paid subscriptions and preserves tier/entitlement context", () => {
    const decision = decideSubscriptionEntitlement(
      {
        status: "active",
        tierId: "founding",
        entitlementKeys: ["paid_content", "private_podcast"],
        currentPeriodEnd: "2026-08-10T00:00:00.000Z",
      },
      { now },
    );

    expect(decision).toMatchObject({
      allowed: true,
      reason: "active_subscription",
      status: "active",
      tierId: "founding",
      entitlementKeys: ["paid_content", "private_podcast"],
    });
    expect(decision.accessEndsAt?.toISOString()).toBe("2026-08-10T00:00:00.000Z");
  });

  it("denies missing, free, and expired access states", () => {
    expect(decideSubscriptionEntitlement(undefined, { now })).toMatchObject({
      allowed: false,
      reason: "missing_subscription",
      status: "none",
    });
    expect(decideSubscriptionEntitlement({ status: "free" }, { now })).toMatchObject({
      allowed: false,
      reason: "free_subscription",
      status: "free",
    });
    expect(
      decideSubscriptionEntitlement(
        {
          status: "active",
          currentPeriodEnd: "2026-07-01T00:00:00.000Z",
        },
        { now },
      ),
    ).toMatchObject({
      allowed: false,
      reason: "access_period_ended",
      status: "active",
    });
    expect(
      decideSubscriptionEntitlement(
        {
          status: "expired",
          currentPeriodEnd: "2026-07-01T00:00:00.000Z",
        },
        { now },
      ),
    ).toMatchObject({
      allowed: false,
      reason: "access_period_ended",
      status: "expired",
    });
  });

  it("covers canceled access windows and complimentary subscriptions", () => {
    expect(
      decideSubscriptionEntitlement(
        {
          status: "canceled",
          currentPeriodEnd: "2026-07-11T00:00:00.000Z",
        },
        { now },
      ),
    ).toMatchObject({
      allowed: true,
      reason: "canceled_with_remaining_period",
      status: "canceled",
    });

    expect(
      decideSubscriptionEntitlement(
        {
          status: "canceled",
          currentPeriodEnd: "2026-07-09T00:00:00.000Z",
        },
        { now },
      ),
    ).toMatchObject({
      allowed: false,
      reason: "access_period_ended",
      status: "canceled",
    });

    expect(
      decideSubscriptionEntitlement(
        {
          status: "comped",
          tierId: "supporter",
          entitlementKeys: ["paid_content"],
        },
        { now },
      ),
    ).toMatchObject({
      allowed: true,
      reason: "complimentary_access",
      status: "comped",
      tierId: "supporter",
    });
  });

  it("allows past-due access only through the grace window", () => {
    const inGrace = decideSubscriptionEntitlement(
      {
        status: "past_due",
        currentPeriodEnd: "2026-07-09T12:00:00.000Z",
      },
      { now, pastDueGracePeriodDays: 3 },
    );
    const outOfGrace = decideSubscriptionEntitlement(
      {
        status: "past_due",
        currentPeriodEnd: "2026-07-01T12:00:00.000Z",
      },
      { now, pastDueGracePeriodDays: 3 },
    );

    expect(inGrace).toMatchObject({
      allowed: true,
      reason: "past_due_grace_period",
      status: "past_due",
    });
    expect(inGrace.gracePeriodEndsAt?.toISOString()).toBe("2026-07-12T12:00:00.000Z");
    expect(outOfGrace).toMatchObject({
      allowed: false,
      reason: "payment_required",
      status: "past_due",
    });
  });

  it("uses the seven-day launch grace policy for web and private podcast access", () => {
    const decision = decideSubscriptionEntitlement(
      {
        status: "past_due",
        tierId: "founding",
        entitlementKeys: ["paid_content", "private_podcast"],
        currentPeriodEnd: "2026-07-09T12:00:00.000Z",
      },
      { now },
    );

    expect(DEFAULT_PAST_DUE_GRACE_PERIOD_DAYS).toBe(7);
    expect(decision).toMatchObject({
      allowed: true,
      reason: "past_due_grace_period",
      status: "past_due",
      tierId: "founding",
      entitlementKeys: ["paid_content", "private_podcast"],
    });
    expect(decision.gracePeriodEndsAt?.toISOString()).toBe("2026-07-16T12:00:00.000Z");
  });

  it("maps grace_period, unpaid, canceled, and expired states to access decisions", () => {
    expect(
      decideSubscriptionEntitlement(
        {
          status: "grace_period",
          currentPeriodEnd: "2026-07-09T12:00:00.000Z",
        },
        { now },
      ),
    ).toMatchObject({
      allowed: true,
      reason: "past_due_grace_period",
      status: "grace_period",
    });
    expect(
      decideSubscriptionEntitlement(
        {
          status: "unpaid",
          accessEndsAt: "2026-07-11T12:00:00.000Z",
        },
        { now },
      ),
    ).toMatchObject({
      allowed: true,
      reason: "unpaid_with_remaining_access",
      status: "unpaid",
    });
    expect(
      decideSubscriptionEntitlement(
        {
          status: "unpaid",
          accessEndsAt: "2026-07-09T12:00:00.000Z",
        },
        { now },
      ),
    ).toMatchObject({
      allowed: false,
      reason: "payment_required",
      status: "unpaid",
    });
    expect(
      decideSubscriptionEntitlement(
        {
          status: "canceled",
          currentPeriodEnd: "2026-07-11T12:00:00.000Z",
        },
        { now },
      ),
    ).toMatchObject({
      allowed: true,
      reason: "canceled_with_remaining_period",
      status: "canceled",
    });
    expect(
      decideSubscriptionEntitlement(
        {
          status: "expired",
          currentPeriodEnd: "2026-07-09T12:00:00.000Z",
        },
        { now },
      ),
    ).toMatchObject({
      allowed: false,
      reason: "access_period_ended",
      status: "expired",
    });
  });

  it("prefers explicit access end over computed grace period", () => {
    expect(
      getPastDueGracePeriodEnd(
        {
          accessEndsAt: "2026-07-20T00:00:00.000Z",
          currentPeriodEnd: "2026-07-09T00:00:00.000Z",
          statusChangedAt: "2026-07-08T00:00:00.000Z",
        },
        { pastDueGracePeriodDays: 3 },
      )?.toISOString(),
    ).toBe("2026-07-20T00:00:00.000Z");
  });
});

describe("content access requirements", () => {
  it("maps visibility to public, free subscriber, paid, and tier-specific rules", () => {
    expect(derivePostAccessRequirementFromVisibility("public")).toMatchObject({
      rule: "public",
      requiresAuthentication: false,
      requiresPaidSubscription: false,
    });
    expect(derivePostAccessRequirementFromVisibility("free_subscribers")).toMatchObject({
      rule: "free_subscriber",
      requiresAuthentication: true,
      requiresPaidSubscription: false,
    });
    expect(derivePostAccessRequirementFromVisibility("paid_any")).toMatchObject({
      rule: "paid_subscription",
      requiresAuthentication: true,
      requiresPaidSubscription: true,
    });
    expect(
      derivePostAccessRequirement({ visibility: "specific_tiers", tierIds: ["a", "a", "b"] }),
    ).toMatchObject({
      rule: "specific_tiers",
      requiresAuthentication: true,
      requiresPaidSubscription: true,
      allowedTierIds: ["a", "b"],
    });
  });
});
