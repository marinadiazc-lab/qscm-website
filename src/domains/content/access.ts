import type {
  ContentTierId,
  PostAccessRequirement,
  PostFrontmatter,
  PostVisibility,
} from "./types";
import type {
  EntitlementDecision,
  SubscriptionEntitlementState,
  EntitlementPolicy,
} from "../subscriptions";
import { decideSubscriptionEntitlement } from "../subscriptions";

export interface PostAccessFrontmatterInput {
  visibility?: PostVisibility;
  tierIds?: readonly ContentTierId[];
}

const visibilityLabels: Record<PostVisibility, string> = {
  public: "Public",
  free_subscribers: "Free subscribers",
  paid_any: "Paid",
  specific_tiers: "Tier restricted",
};

export function getPostVisibilityLabel(visibility: PostVisibility) {
  return visibilityLabels[visibility];
}

export type PostAccessDecisionReason =
  | "public"
  | "authenticated_free_subscriber"
  | "paid_subscription"
  | "specific_tier"
  | "authentication_required"
  | "subscription_required"
  | "tier_required";

export interface PostAccessDecision {
  allowed: boolean;
  reason: PostAccessDecisionReason;
  requirement: PostAccessRequirement;
  checkedAt: Date;
  lock: {
    title: string;
    message: string;
    primaryAction: "login" | "subscribe" | "upgrade";
  } | null;
}

export function derivePostAccessRequirement(
  frontmatter: PostAccessFrontmatterInput | Pick<PostFrontmatter, "visibility" | "tierIds">,
): PostAccessRequirement {
  return derivePostAccessRequirementFromVisibility(
    frontmatter.visibility ?? "public",
    frontmatter.tierIds ?? [],
  );
}

export function derivePostAccessRequirementFromVisibility(
  visibility: PostVisibility,
  tierIds: readonly ContentTierId[] = [],
): PostAccessRequirement {
  switch (visibility) {
    case "public":
      return {
        visibility,
        rule: "public",
        requiresAuthentication: false,
        requiresPaidSubscription: false,
        allowedTierIds: [],
      };
    case "free_subscribers":
      return {
        visibility,
        rule: "free_subscriber",
        requiresAuthentication: true,
        requiresPaidSubscription: false,
        allowedTierIds: [],
      };
    case "paid_any":
      return {
        visibility,
        rule: "paid_subscription",
        requiresAuthentication: true,
        requiresPaidSubscription: true,
        allowedTierIds: [],
      };
    case "specific_tiers":
      return {
        visibility,
        rule: "specific_tiers",
        requiresAuthentication: true,
        requiresPaidSubscription: true,
        allowedTierIds: uniqueTierIds(tierIds),
      };
  }
}

function uniqueTierIds(tierIds: readonly ContentTierId[]) {
  return Array.from(new Set(tierIds));
}

export type PostAccessViewer =
  | {
      kind: "anonymous";
    }
  | {
      kind: "authenticated";
      isFreeSubscriber?: boolean;
      subscription?: SubscriptionEntitlementState | null;
      entitlement?: EntitlementDecision;
    };

export interface EvaluatePostAccessInput {
  requirement: PostAccessRequirement;
  viewer?: PostAccessViewer;
  now?: Date;
  entitlementPolicy?: EntitlementPolicy;
}

export function evaluatePostAccess(input: EvaluatePostAccessInput): PostAccessDecision {
  const checkedAt = input.now ?? new Date();
  const viewer = input.viewer ?? { kind: "anonymous" };
  const requirement = input.requirement;

  if (requirement.rule === "public") {
    return allow("public", requirement, checkedAt);
  }

  if (viewer.kind === "anonymous") {
    return deny({
      reason: "authentication_required",
      requirement,
      checkedAt,
      title: "Sign in to keep reading",
      message: getAuthenticationMessage(requirement),
      primaryAction: "login",
    });
  }

  if (requirement.rule === "free_subscriber") {
    if (viewer.isFreeSubscriber || hasAllowedSubscription(viewer, checkedAt, input.entitlementPolicy)) {
      return allow("authenticated_free_subscriber", requirement, checkedAt);
    }

    return deny({
      reason: "subscription_required",
      requirement,
      checkedAt,
      title: "Subscribe to keep reading",
      message: "This post is available to free subscribers.",
      primaryAction: "subscribe",
    });
  }

  const entitlement = getViewerEntitlement(viewer, checkedAt, input.entitlementPolicy);

  if (!entitlement.allowed) {
    return deny({
      reason: "subscription_required",
      requirement,
      checkedAt,
      title: "Upgrade to keep reading",
      message: "This post is available to paid subscribers.",
      primaryAction: "subscribe",
    });
  }

  if (requirement.rule === "paid_subscription") {
    return allow("paid_subscription", requirement, checkedAt);
  }

  if (hasRequiredTier(requirement.allowedTierIds, entitlement)) {
    return allow("specific_tier", requirement, checkedAt);
  }

  return deny({
    reason: "tier_required",
    requirement,
    checkedAt,
    title: "Upgrade to keep reading",
    message: "This post is available only to selected paid tiers.",
    primaryAction: "upgrade",
  });
}

export function getAccessiblePostBody(body: string, decision: PostAccessDecision) {
  return decision.allowed ? body : null;
}

function getViewerEntitlement(
  viewer: Extract<PostAccessViewer, { kind: "authenticated" }>,
  checkedAt: Date,
  policy: EntitlementPolicy | undefined,
) {
  return (
    viewer.entitlement ??
    decideSubscriptionEntitlement(viewer.subscription, {
      ...policy,
      now: policy?.now ?? checkedAt,
    })
  );
}

function hasAllowedSubscription(
  viewer: Extract<PostAccessViewer, { kind: "authenticated" }>,
  checkedAt: Date,
  policy: EntitlementPolicy | undefined,
) {
  return getViewerEntitlement(viewer, checkedAt, policy).allowed;
}

function hasRequiredTier(allowedTierIds: readonly ContentTierId[], entitlement: EntitlementDecision) {
  if (allowedTierIds.length === 0) {
    return false;
  }

  const tierIds = new Set([
    entitlement.tierId,
    ...entitlement.entitlementKeys
      .filter((key) => key.startsWith("tier:"))
      .map((key) => key.slice("tier:".length)),
  ].filter((tierId): tierId is string => Boolean(tierId)));

  return allowedTierIds.some((tierId) => tierIds.has(tierId));
}

function getAuthenticationMessage(requirement: PostAccessRequirement) {
  if (requirement.rule === "free_subscriber") {
    return "This post is available to signed-in subscribers.";
  }

  return "This post is available to paid subscribers.";
}

function allow(
  reason: PostAccessDecision["reason"],
  requirement: PostAccessRequirement,
  checkedAt: Date,
): PostAccessDecision {
  return {
    allowed: true,
    reason,
    requirement,
    checkedAt,
    lock: null,
  };
}

function deny(input: {
  reason: PostAccessDecision["reason"];
  requirement: PostAccessRequirement;
  checkedAt: Date;
  title: string;
  message: string;
  primaryAction: NonNullable<PostAccessDecision["lock"]>["primaryAction"];
}): PostAccessDecision {
  return {
    allowed: false,
    reason: input.reason,
    requirement: input.requirement,
    checkedAt: input.checkedAt,
    lock: {
      title: input.title,
      message: input.message,
      primaryAction: input.primaryAction,
    },
  };
}
