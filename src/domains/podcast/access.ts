import type {
  PodcastAccessDecision,
  PodcastAccessDecisionReason,
  PodcastAccessRule,
  PodcastEntitlementCheckRequest,
  PodcastEntitlementResolver,
  PodcastEntitlementResult,
  PodcastEpisode,
  PodcastShow,
  PrivateFeedToken,
} from "./types";

export interface TokenLifecycleOptions {
  now?: Date;
}

export interface PodcastShowAccessInput {
  token: PrivateFeedToken;
  show: PodcastShow;
  entitlement?: PodcastEntitlementResult;
  resolveEntitlement?: PodcastEntitlementResolver;
  now?: Date;
}

export interface PodcastEpisodeAccessInput extends PodcastShowAccessInput {
  episode: PodcastEpisode;
}

export function isPrivateFeedTokenRevoked(
  token: PrivateFeedToken,
  options: TokenLifecycleOptions = {},
) {
  const now = options.now ?? new Date();

  return token.status === "revoked" || isDateReached(token.revokedAt, now);
}

export function isPrivateFeedTokenRotated(
  token: PrivateFeedToken,
  options: TokenLifecycleOptions = {},
) {
  const now = options.now ?? new Date();

  return token.status === "rotated" || isDateReached(token.rotatedAt, now);
}

export function isPrivateFeedTokenExpired(
  token: PrivateFeedToken,
  options: TokenLifecycleOptions = {},
) {
  const now = options.now ?? new Date();

  return token.status === "expired" || isDateReached(token.expiresAt, now);
}

export function isPrivateFeedTokenActive(
  token: PrivateFeedToken,
  options: TokenLifecycleOptions = {},
) {
  if (token.status !== "active") {
    return false;
  }

  return (
    !isPrivateFeedTokenRevoked(token, options) &&
    !isPrivateFeedTokenRotated(token, options) &&
    !isPrivateFeedTokenExpired(token, options)
  );
}

export function canPrivateFeedTokenAccessShow(
  input: PodcastShowAccessInput,
): PodcastAccessDecision {
  const checkedAt = input.now ?? new Date();
  const tokenDenial = getTokenDenial(input.token, checkedAt);

  if (tokenDenial) {
    return deny(input.token, tokenDenial, checkedAt);
  }

  if (input.token.publicationId !== input.show.publicationId) {
    return deny(input.token, "token_publication_mismatch", checkedAt);
  }

  if (input.token.showId && input.token.showId !== input.show.id) {
    return deny(input.token, "token_show_mismatch", checkedAt);
  }

  if (input.show.status !== "active") {
    return deny(input.token, "show_inactive", checkedAt);
  }

  return decideAccessRule({
    token: input.token,
    rule: input.show.defaultAccessRule,
    checkedAt,
    entitlement: resolveEntitlementForRule({
      token: input.token,
      show: input.show,
      rule: input.show.defaultAccessRule,
      entitlement: input.entitlement,
      resolveEntitlement: input.resolveEntitlement,
    }),
  });
}

export function canPrivateFeedTokenAccessEpisode(
  input: PodcastEpisodeAccessInput,
): PodcastAccessDecision {
  const checkedAt = input.now ?? new Date();
  const showDecision = canPrivateFeedTokenAccessShow({
    token: input.token,
    show: input.show,
    entitlement: input.entitlement,
    resolveEntitlement: input.resolveEntitlement,
    now: checkedAt,
  });

  if (!showDecision.allowed) {
    return showDecision;
  }

  if (input.episode.showId !== input.show.id) {
    return deny(input.token, "episode_show_mismatch", checkedAt, showDecision.entitlement);
  }

  if (!isEpisodeVisible(input.episode, checkedAt)) {
    return deny(input.token, "episode_unavailable", checkedAt, showDecision.entitlement);
  }

  const rule = input.episode.accessRule ?? input.show.defaultAccessRule;

  return decideAccessRule({
    token: input.token,
    rule,
    checkedAt,
    entitlement: resolveEntitlementForRule({
      token: input.token,
      show: input.show,
      episode: input.episode,
      rule,
      entitlement: input.entitlement,
      resolveEntitlement: input.resolveEntitlement,
    }),
  });
}

export function toPodcastEntitlementRequest(input: {
  token: PrivateFeedToken;
  show: PodcastShow;
  episode?: PodcastEpisode;
  rule: PodcastAccessRule;
}): PodcastEntitlementCheckRequest {
  return {
    publicationId: input.show.publicationId,
    tokenId: input.token.id,
    showId: input.show.id,
    episodeId: input.episode?.id,
    subscriberId: input.token.subscriberId,
    userId: input.token.userId,
    requiredEntitlementKeys: input.rule.requiredEntitlementKeys ?? [],
    requiredTierIds: input.rule.requiredTierIds ?? [],
  };
}

function getTokenDenial(
  token: PrivateFeedToken,
  checkedAt: Date,
): PodcastAccessDecisionReason | undefined {
  if (isPrivateFeedTokenRevoked(token, { now: checkedAt })) {
    return "token_revoked";
  }

  if (isPrivateFeedTokenRotated(token, { now: checkedAt })) {
    return "token_rotated";
  }

  if (isPrivateFeedTokenExpired(token, { now: checkedAt })) {
    return "token_expired";
  }

  if (!isPrivateFeedTokenActive(token, { now: checkedAt })) {
    return "token_inactive";
  }

  return undefined;
}

function decideAccessRule(input: {
  token: PrivateFeedToken;
  rule: PodcastAccessRule;
  checkedAt: Date;
  entitlement?: PodcastEntitlementResult;
}): PodcastAccessDecision {
  const windowDenial = getAccessWindowDenial(input.rule, input.checkedAt);

  if (windowDenial) {
    return deny(input.token, windowDenial, input.checkedAt, input.entitlement);
  }

  if (input.rule.kind === "public") {
    return allow(input.token, "allowed_public_access", input.checkedAt, input.entitlement);
  }

  if (input.rule.kind === "private_token") {
    return allow(input.token, "allowed_private_token", input.checkedAt, input.entitlement);
  }

  if (!input.entitlement) {
    return deny(input.token, "entitlement_required", input.checkedAt);
  }

  if (!input.entitlement.allowed) {
    return deny(input.token, "entitlement_denied", input.checkedAt, input.entitlement);
  }

  if (!hasRequiredTier(input.rule, input.entitlement)) {
    return deny(input.token, "tier_required", input.checkedAt, input.entitlement);
  }

  if (!hasRequiredEntitlementKeys(input.rule, input.entitlement)) {
    return deny(input.token, "entitlement_key_required", input.checkedAt, input.entitlement);
  }

  return allow(input.token, "allowed_entitlement", input.checkedAt, input.entitlement);
}

function resolveEntitlementForRule(input: {
  token: PrivateFeedToken;
  show: PodcastShow;
  episode?: PodcastEpisode;
  rule: PodcastAccessRule;
  entitlement?: PodcastEntitlementResult;
  resolveEntitlement?: PodcastEntitlementResolver;
}) {
  if (input.rule.kind !== "entitlement") {
    return input.entitlement;
  }

  return (
    input.entitlement ??
    input.resolveEntitlement?.(
      toPodcastEntitlementRequest({
        token: input.token,
        show: input.show,
        episode: input.episode,
        rule: input.rule,
      }),
    )
  );
}

function getAccessWindowDenial(
  rule: PodcastAccessRule,
  checkedAt: Date,
): PodcastAccessDecisionReason | undefined {
  if (rule.startsAt && checkedAt.getTime() < rule.startsAt.getTime()) {
    return "access_window_not_started";
  }

  if (rule.endsAt && checkedAt.getTime() >= rule.endsAt.getTime()) {
    return "access_window_ended";
  }

  return undefined;
}

function isEpisodeVisible(episode: PodcastEpisode, checkedAt: Date) {
  if (episode.status !== "published") {
    return false;
  }

  if (!episode.publishedAt) {
    return false;
  }

  return episode.publishedAt.getTime() <= checkedAt.getTime();
}

function hasRequiredTier(
  rule: PodcastAccessRule,
  entitlement: PodcastEntitlementResult,
) {
  const requiredTierIds = rule.requiredTierIds ?? [];

  if (requiredTierIds.length === 0) {
    return true;
  }

  return entitlement.tierId ? requiredTierIds.includes(entitlement.tierId) : false;
}

function hasRequiredEntitlementKeys(
  rule: PodcastAccessRule,
  entitlement: PodcastEntitlementResult,
) {
  const requiredEntitlementKeys = rule.requiredEntitlementKeys ?? [];

  if (requiredEntitlementKeys.length === 0) {
    return true;
  }

  const entitlementKeys = entitlement.entitlementKeys ?? [];

  return requiredEntitlementKeys.every((key) => entitlementKeys.includes(key));
}

function allow(
  token: PrivateFeedToken,
  reason: PodcastAccessDecisionReason,
  checkedAt: Date,
  entitlement?: PodcastEntitlementResult,
): PodcastAccessDecision {
  return {
    allowed: true,
    reason,
    checkedAt,
    token: {
      id: token.id,
      status: token.status,
    },
    entitlement,
  };
}

function deny(
  token: PrivateFeedToken,
  reason: PodcastAccessDecisionReason,
  checkedAt: Date,
  entitlement?: PodcastEntitlementResult,
): PodcastAccessDecision {
  return {
    allowed: false,
    reason,
    checkedAt,
    token: {
      id: token.id,
      status: token.status,
    },
    entitlement,
  };
}

function isDateReached(date: Date | undefined, now: Date) {
  return date ? now.getTime() >= date.getTime() : false;
}
