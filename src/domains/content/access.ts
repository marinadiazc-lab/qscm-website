import type {
  ContentTierId,
  PostAccessRequirement,
  PostFrontmatter,
  PostVisibility,
} from "./types";

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
