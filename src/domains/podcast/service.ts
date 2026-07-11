import { createHash, randomBytes, randomUUID } from "crypto";

import type {
  PodcastEpisode,
  PodcastFeedGenerationInput,
  PodcastFeedGenerationResult,
  PodcastRssFeed,
  PodcastShow,
  PrivateFeedDeniedProbe,
  PrivateFeedRawToken,
  PrivateFeedRequestContext,
  PrivateFeedSharingSignal,
  PrivateFeedToken,
  PrivateFeedTokenAuditEvent,
  PrivateFeedTokenHash,
  PrivateFeedTokenId,
  PrivateFeedTokenIssueResult,
} from "./types";
import { buildPodcastRssFeed } from "./feed";

export interface PodcastRepository {
  findShowBySlug(
    slug: string,
    publicationId?: string,
  ): PodcastShow | undefined | Promise<PodcastShow | undefined>;
  listPublishedEpisodesForShow(
    showId: string,
    now: Date,
  ): PodcastEpisode[] | Promise<PodcastEpisode[]>;
  findTokenByHash(
    tokenHash: PrivateFeedTokenHash,
  ): PrivateFeedToken | undefined | Promise<PrivateFeedToken | undefined>;
  findTokenById(
    tokenId: PrivateFeedTokenId,
  ): PrivateFeedToken | undefined | Promise<PrivateFeedToken | undefined>;
  saveToken(token: PrivateFeedToken): PrivateFeedToken | Promise<PrivateFeedToken>;
  recordAuditEvent(event: PrivateFeedTokenAuditEvent): void | Promise<void>;
  recordDeniedFeedProbe?(probe: PrivateFeedDeniedProbe): void | Promise<void>;
  listAccessEventsForToken?(
    tokenId: PrivateFeedTokenId,
    since: Date,
  ): PrivateFeedTokenAuditEvent[] | Promise<PrivateFeedTokenAuditEvent[]>;
}

export interface IssuePrivateFeedTokenInput {
  repository: PodcastRepository;
  publicationId: string;
  show?: PodcastShow;
  subscriberId?: string;
  userId?: string;
  baseUrl?: string;
  now?: Date;
  expiresAt?: Date;
}

export interface RotatePrivateFeedTokenInput extends IssuePrivateFeedTokenInput {
  tokenId: PrivateFeedTokenId;
}

export interface RevokePrivateFeedTokenInput {
  repository: PodcastRepository;
  tokenId: PrivateFeedTokenId;
  now?: Date;
}

export interface BuildPrivateFeedInput
  extends Omit<PodcastFeedGenerationInput, "show" | "episodes" | "token"> {
  repository: PodcastRepository;
  showSlug: string;
  rawToken: PrivateFeedRawToken;
  requestContext?: PrivateFeedRequestContext;
}

export type BuildPrivateFeedResult =
  | (PodcastFeedGenerationResult & {
      allowed: true;
      feed: PodcastRssFeed;
      status: 200;
      show: PodcastShow;
      token: PrivateFeedToken;
    })
  | {
      allowed: false;
      status: 401 | 403 | 404;
      reason: string;
      deniedEpisodeIds: string[];
      feed?: undefined;
      show?: undefined;
      token?: undefined;
    };

export function createPrivateFeedRawToken() {
  return randomBytes(32).toString("base64url");
}

export function hashPrivateFeedToken(rawToken: PrivateFeedRawToken): PrivateFeedTokenHash {
  return `sha256:${createHash("sha256").update(rawToken, "utf8").digest("base64url")}`;
}

export function buildPrivateFeedUrl(input: {
  baseUrl: string;
  showSlug: string;
  rawToken: PrivateFeedRawToken;
}) {
  return new URL(
    `/podcast/${encodeURIComponent(input.showSlug)}/${encodeURIComponent(input.rawToken)}/rss.xml`,
    ensureTrailingSlash(input.baseUrl),
  ).toString();
}

export async function issuePrivateFeedToken(
  input: IssuePrivateFeedTokenInput,
): Promise<PrivateFeedTokenIssueResult> {
  const now = input.now ?? new Date();
  const rawToken = createPrivateFeedRawToken();
  const token: PrivateFeedToken = {
    id: createPodcastId(),
    publicationId: input.publicationId,
    showId: input.show?.id,
    subscriberId: input.subscriberId,
    userId: input.userId,
    tokenHash: hashPrivateFeedToken(rawToken),
    status: "active",
    createdAt: now,
    updatedAt: now,
    expiresAt: input.expiresAt,
  };

  const saved = await input.repository.saveToken(token);
  await input.repository.recordAuditEvent({
    id: createPodcastId(),
    tokenId: saved.id,
    kind: "issued",
    occurredAt: now,
    showId: input.show?.id,
  });

  return {
    token: saved,
    rawToken,
    feedUrl:
      input.baseUrl && input.show
        ? buildPrivateFeedUrl({
            baseUrl: input.baseUrl,
            showSlug: input.show.slug,
            rawToken,
          })
        : undefined,
  };
}

export async function rotatePrivateFeedToken(
  input: RotatePrivateFeedTokenInput,
): Promise<PrivateFeedTokenIssueResult | undefined> {
  const now = input.now ?? new Date();
  const existing = await input.repository.findTokenById(input.tokenId);

  if (!existing) {
    return undefined;
  }

  const rawToken = createPrivateFeedRawToken();
  const replacementToken: PrivateFeedToken = {
    id: createPodcastId(),
    publicationId: existing.publicationId,
    showId: existing.showId,
    subscriberId: existing.subscriberId,
    userId: existing.userId,
    tokenHash: hashPrivateFeedToken(rawToken),
    status: "active",
    createdAt: now,
    updatedAt: now,
    expiresAt: input.expiresAt,
  };
  const savedReplacement = await input.repository.saveToken(replacementToken);
  await input.repository.recordAuditEvent({
    id: createPodcastId(),
    tokenId: savedReplacement.id,
    kind: "issued",
    occurredAt: now,
    showId: existing.showId,
  });

  await input.repository.saveToken({
    ...existing,
    status: "rotated",
    rotatedAt: now,
    rotatedToTokenId: savedReplacement.id,
    updatedAt: now,
  });
  await input.repository.recordAuditEvent({
    id: createPodcastId(),
    tokenId: existing.id,
    kind: "rotated",
    occurredAt: now,
    showId: existing.showId,
  });

  const feedShow =
    input.show && (!existing.showId || input.show.id === existing.showId)
      ? input.show
      : undefined;

  return {
    token: savedReplacement,
    rawToken,
    feedUrl:
      input.baseUrl && feedShow
        ? buildPrivateFeedUrl({
            baseUrl: input.baseUrl,
            showSlug: feedShow.slug,
            rawToken,
          })
        : undefined,
  };
}

export async function revokePrivateFeedToken(input: RevokePrivateFeedTokenInput) {
  const now = input.now ?? new Date();
  const existing = await input.repository.findTokenById(input.tokenId);

  if (!existing) {
    return undefined;
  }

  const revoked = await input.repository.saveToken({
    ...existing,
    status: "revoked",
    revokedAt: now,
    updatedAt: now,
  });
  await input.repository.recordAuditEvent({
    id: createPodcastId(),
    tokenId: existing.id,
    kind: "revoked",
    occurredAt: now,
    showId: existing.showId,
  });

  return revoked;
}

export async function buildPrivatePodcastFeed(
  input: BuildPrivateFeedInput,
): Promise<BuildPrivateFeedResult> {
  const generatedAt = input.generatedAt ?? new Date();
  const tokenHash = hashPrivateFeedToken(input.rawToken);
  const token = await input.repository.findTokenByHash(tokenHash);

  if (!token) {
    await recordDeniedFeedProbe(input.repository, {
      tokenHash,
      showSlug: input.showSlug,
      reason: "token_not_found",
      occurredAt: generatedAt,
      requestContext: input.requestContext,
    });

    return {
      allowed: false,
      status: 401,
      reason: "token_not_found",
      deniedEpisodeIds: [],
    };
  }

  const show = await input.repository.findShowBySlug(input.showSlug, token?.publicationId);

  if (!show) {
    await recordDeniedFeedProbe(input.repository, {
      publicationId: token.publicationId,
      tokenHash,
      showSlug: input.showSlug,
      tokenId: token.id,
      reason: "show_not_found",
      occurredAt: generatedAt,
      requestContext: input.requestContext,
    });
    await input.repository.recordAuditEvent({
      id: createPodcastId(),
      tokenId: token.id,
      kind: "access_denied",
      occurredAt: generatedAt,
      reason: "show_not_found",
      requestContext: input.requestContext,
    });

    return {
      allowed: false,
      status: 404,
      reason: "show_not_found",
      deniedEpisodeIds: [],
    };
  }

  const episodes = await input.repository.listPublishedEpisodesForShow(show.id, generatedAt);
  const result = buildPodcastRssFeed({
    show,
    token,
    episodes,
    entitlement: input.entitlement,
    resolveEntitlement: input.resolveEntitlement,
    generatedAt,
    limit: input.limit,
  });

  await input.repository.recordAuditEvent({
    id: createPodcastId(),
    tokenId: token.id,
    kind: result.allowed ? "access_granted" : "access_denied",
    occurredAt: generatedAt,
    showId: show.id,
    reason: result.decision.reason,
    requestContext: input.requestContext,
  });

  if (!result.allowed) {
    return {
      allowed: false,
      deniedEpisodeIds: result.deniedEpisodeIds,
      reason: result.decision.reason,
      status: statusForDeniedPrivateFeed(result.decision.reason),
    };
  }

  if (!result.feed) {
    return {
      allowed: false,
      deniedEpisodeIds: result.deniedEpisodeIds,
      reason: "feed_unavailable",
      status: 403,
    };
  }

  return {
    allowed: true,
    decision: result.decision,
    feed: result.feed,
    deniedEpisodeIds: result.deniedEpisodeIds,
    status: 200,
    show,
    token,
  };
}

async function recordDeniedFeedProbe(
  repository: PodcastRepository,
  probe: PrivateFeedDeniedProbe,
) {
  await repository.recordDeniedFeedProbe?.(probe);
}

function statusForDeniedPrivateFeed(reason: string): 401 | 403 {
  return ["token_inactive", "token_revoked", "token_rotated", "token_expired"].includes(reason)
    ? 401
    : 403;
}

export function serializePodcastRss(feed: PodcastRssFeed) {
  const owner = feed.owner
    ? `
        <itunes:owner>
          <itunes:name>${escapeXml(feed.owner.name)}</itunes:name>
          ${
            feed.owner.email
              ? `<itunes:email>${escapeXml(feed.owner.email)}</itunes:email>`
              : ""
          }
        </itunes:owner>`
    : "";
  const image = feed.imageUrl
    ? `
        <itunes:image href="${escapeXml(feed.imageUrl)}" />`
    : "";
  const items = feed.items
    .map(
      (item) => `
        <item>
          <guid isPermaLink="false">${escapeXml(item.guid)}</guid>
          <title>${escapeXml(item.title)}</title>
          <description>${escapeXml(item.description)}</description>
          ${item.link ? `<link>${escapeXml(item.link)}</link>` : ""}
          <pubDate>${item.publishedAt.toUTCString()}</pubDate>
          ${
            item.updatedAt
              ? `<lastBuildDate>${item.updatedAt.toUTCString()}</lastBuildDate>`
              : ""
          }
          ${
            item.durationSeconds
              ? `<itunes:duration>${formatDuration(item.durationSeconds)}</itunes:duration>`
              : ""
          }
          ${
            item.seasonNumber
              ? `<itunes:season>${item.seasonNumber}</itunes:season>`
              : ""
          }
          ${
            item.episodeNumber
              ? `<itunes:episode>${item.episodeNumber}</itunes:episode>`
              : ""
          }
          <itunes:explicit>${item.explicit ? "true" : "false"}</itunes:explicit>
          <enclosure url="${escapeXml(item.enclosure.url)}" type="${escapeXml(
            item.enclosure.type,
          )}"${item.enclosure.length ? ` length="${item.enclosure.length}"` : ""} />
        </item>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" ?>
    <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
      <channel>
        <title>${escapeXml(feed.title)}</title>
        <link>${escapeXml(feed.link)}</link>
        <description>${escapeXml(feed.description)}</description>
        <language>${escapeXml(feed.language)}</language>
        <lastBuildDate>${feed.generatedAt.toUTCString()}</lastBuildDate>
        ${feed.feedUrl ? `<atom:link href="${escapeXml(feed.feedUrl)}" rel="self" type="application/rss+xml" />` : ""}
        ${feed.authorName ? `<itunes:author>${escapeXml(feed.authorName)}</itunes:author>` : ""}
        <itunes:explicit>${feed.explicit ? "true" : "false"}</itunes:explicit>
        ${owner}
        ${image}
        ${items}
      </channel>
    </rss>`;
}

export function detectPrivateFeedSharingSignal(input: {
  tokenId: PrivateFeedTokenId;
  events: readonly PrivateFeedTokenAuditEvent[];
  now?: Date;
  maxDistinctIpAddresses?: number;
  maxDistinctUserAgents?: number;
}): PrivateFeedSharingSignal {
  const ipAddresses = uniqueValues(
    input.events.map((event) => event.requestContext?.ipAddress).filter(Boolean),
  );
  const userAgents = uniqueValues(
    input.events.map((event) => event.requestContext?.userAgent).filter(Boolean),
  );
  const maxDistinctIpAddresses = input.maxDistinctIpAddresses ?? 5;
  const maxDistinctUserAgents = input.maxDistinctUserAgents ?? 8;

  if (ipAddresses.length > maxDistinctIpAddresses) {
    return {
      tokenId: input.tokenId,
      suspicious: true,
      reason: "ip_address_spread",
      distinctIpAddresses: ipAddresses.length,
      distinctUserAgents: userAgents.length,
      observedAccesses: input.events.length,
      checkedAt: input.now ?? new Date(),
    };
  }

  if (userAgents.length > maxDistinctUserAgents) {
    return {
      tokenId: input.tokenId,
      suspicious: true,
      reason: "user_agent_spread",
      distinctIpAddresses: ipAddresses.length,
      distinctUserAgents: userAgents.length,
      observedAccesses: input.events.length,
      checkedAt: input.now ?? new Date(),
    };
  }

  return {
    tokenId: input.tokenId,
    suspicious: false,
    reason: "within_expected_use",
    distinctIpAddresses: ipAddresses.length,
    distinctUserAgents: userAgents.length,
    observedAccesses: input.events.length,
    checkedAt: input.now ?? new Date(),
  };
}

export function createPodcastId() {
  return randomUUID();
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  return [hours, minutes, remainingSeconds]
    .map((value) => value.toString().padStart(2, "0"))
    .join(":");
}

function uniqueValues<T>(values: readonly (T | undefined)[]) {
  return Array.from(new Set(values.filter((value): value is T => value !== undefined)));
}
