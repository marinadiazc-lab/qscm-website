import type { EntitlementKey, TierId } from "../subscriptions";

export type PodcastShowId = string;
export type PodcastEpisodeId = string;
export type PrivateFeedTokenId = string;
export type PrivateFeedTokenHash = string;
export type PrivateFeedRawToken = string;

export type PodcastShowStatus = "draft" | "active" | "archived";

export type PodcastEpisodeStatus = "draft" | "scheduled" | "published" | "archived";

export type PodcastEpisodeVisibility = "public" | "private" | "unlisted";

export type PodcastAccessRuleKind = "public" | "private_token" | "entitlement";

export type PodcastAudioDeliveryMode =
  | "stable_cdn_obscure_url"
  | "strict_signed_audio_url";

export interface PodcastAccessRule {
  kind: PodcastAccessRuleKind;
  requiredEntitlementKeys?: readonly EntitlementKey[];
  requiredTierIds?: readonly TierId[];
  startsAt?: Date;
  endsAt?: Date;
}

export interface PodcastOwnerContact {
  name: string;
  email?: string;
}

export interface PodcastShow {
  id: PodcastShowId;
  publicationId: string;
  slug: string;
  title: string;
  description: string;
  status: PodcastShowStatus;
  language: string;
  siteUrl: string;
  feedUrl?: string;
  coverImageUrl?: string;
  authorName?: string;
  owner?: PodcastOwnerContact;
  explicit?: boolean;
  defaultAccessRule: PodcastAccessRule;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
}

export interface PodcastMediaEnclosure {
  url: string;
  mimeType: string;
  byteLength?: number;
  durationSeconds?: number;
  deliveryMode: PodcastAudioDeliveryMode;
  cdnObjectKey?: string;
  checksumSha256?: string;
}

export interface PodcastEpisode {
  id: PodcastEpisodeId;
  showId: PodcastShowId;
  slug: string;
  guid: string;
  title: string;
  description: string;
  status: PodcastEpisodeStatus;
  visibility: PodcastEpisodeVisibility;
  accessRule?: PodcastAccessRule;
  enclosure: PodcastMediaEnclosure;
  seasonNumber?: number;
  episodeNumber?: number;
  explicit?: boolean;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
}

export type PrivateFeedTokenStatus = "active" | "revoked" | "rotated" | "expired";

export interface PrivateFeedToken {
  id: PrivateFeedTokenId;
  publicationId: string;
  showId?: PodcastShowId;
  subscriberId?: string;
  userId?: string;
  tokenHash: PrivateFeedTokenHash;
  status: PrivateFeedTokenStatus;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  revokedAt?: Date;
  rotatedAt?: Date;
  rotatedToTokenId?: PrivateFeedTokenId;
  lastAccessedAt?: Date;
}

export type PrivateFeedTokenAuditEventKind =
  | "issued"
  | "revoked"
  | "rotated"
  | "expired"
  | "access_granted"
  | "access_denied"
  | "sharing_signal";

export interface PrivateFeedRequestContext {
  ipAddress?: string;
  userAgent?: string;
  referer?: string;
}

export interface PrivateFeedTokenAuditEvent {
  id: string;
  tokenId: PrivateFeedTokenId;
  kind: PrivateFeedTokenAuditEventKind;
  occurredAt: Date;
  showId?: PodcastShowId;
  episodeId?: PodcastEpisodeId;
  reason?: string;
  requestContext?: PrivateFeedRequestContext;
}

export interface PrivateFeedDeniedProbe {
  publicationId?: string;
  tokenHash: PrivateFeedTokenHash;
  showSlug: string;
  tokenId?: PrivateFeedTokenId;
  showId?: PodcastShowId;
  reason: string;
  occurredAt: Date;
  requestContext?: PrivateFeedRequestContext;
}

export interface PrivateFeedAccessEvent {
  tokenId: PrivateFeedTokenId;
  showId: PodcastShowId;
  episodeId?: PodcastEpisodeId;
  allowed: boolean;
  reason: string;
  occurredAt: Date;
  requestContext?: PrivateFeedRequestContext;
}

export interface PodcastEntitlementCheckRequest {
  publicationId: string;
  tokenId: PrivateFeedTokenId;
  showId: PodcastShowId;
  episodeId?: PodcastEpisodeId;
  subscriberId?: string;
  userId?: string;
  requiredEntitlementKeys: readonly EntitlementKey[];
  requiredTierIds: readonly TierId[];
}

export interface PodcastEntitlementResult {
  allowed: boolean;
  reason: string;
  checkedAt: Date;
  entitlementKeys?: readonly EntitlementKey[];
  tierId?: TierId;
  accessEndsAt?: Date | null;
}

export type PodcastEntitlementResolver = (
  request: PodcastEntitlementCheckRequest,
) => PodcastEntitlementResult;

export type PodcastAccessDecisionReason =
  | "allowed_public_access"
  | "allowed_private_token"
  | "allowed_entitlement"
  | "token_inactive"
  | "token_revoked"
  | "token_rotated"
  | "token_expired"
  | "token_publication_mismatch"
  | "token_show_mismatch"
  | "show_inactive"
  | "episode_show_mismatch"
  | "episode_unavailable"
  | "access_window_not_started"
  | "access_window_ended"
  | "entitlement_required"
  | "entitlement_denied"
  | "tier_required"
  | "entitlement_key_required";

export interface PodcastAccessDecision {
  allowed: boolean;
  reason: PodcastAccessDecisionReason;
  checkedAt: Date;
  token: {
    id: PrivateFeedTokenId;
    status: PrivateFeedTokenStatus;
  };
  entitlement?: PodcastEntitlementResult;
}

export interface PrivateFeedTokenIssueResult {
  token: PrivateFeedToken;
  rawToken: PrivateFeedRawToken;
  feedUrl?: string;
}

export interface PrivateFeedSharingSignal {
  tokenId: PrivateFeedTokenId;
  suspicious: boolean;
  reason: "ip_address_spread" | "user_agent_spread" | "within_expected_use";
  distinctIpAddresses: number;
  distinctUserAgents: number;
  observedAccesses: number;
  checkedAt: Date;
}

export interface PodcastRssEnclosure {
  url: string;
  type: string;
  length?: number;
}

export interface PodcastRssItem {
  guid: string;
  title: string;
  description: string;
  link?: string;
  publishedAt: Date;
  updatedAt?: Date;
  durationSeconds?: number;
  explicit?: boolean;
  seasonNumber?: number;
  episodeNumber?: number;
  enclosure: PodcastRssEnclosure;
}

export interface PodcastRssFeed {
  title: string;
  description: string;
  link: string;
  feedUrl?: string;
  language: string;
  authorName?: string;
  owner?: PodcastOwnerContact;
  imageUrl?: string;
  explicit?: boolean;
  generatedAt: Date;
  delivery: {
    feedAccess: "private_rss_bearer_token";
    audioAccess: PodcastAudioDeliveryMode;
  };
  items: PodcastRssItem[];
}

export interface PodcastFeedGenerationInput {
  show: PodcastShow;
  episodes: readonly PodcastEpisode[];
  token: PrivateFeedToken;
  entitlement?: PodcastEntitlementResult;
  resolveEntitlement?: PodcastEntitlementResolver;
  generatedAt?: Date;
  limit?: number;
}

export interface PodcastFeedGenerationResult {
  allowed: boolean;
  decision: PodcastAccessDecision;
  feed?: PodcastRssFeed;
  deniedEpisodeIds: PodcastEpisodeId[];
}
