import { and, desc, eq, lte, sql } from "drizzle-orm";

import type { DbClient } from "@/src/db";
import * as schema from "@/src/db/schema";
import type {
  PodcastAccessRule,
  PodcastEpisode,
  PodcastMediaEnclosure,
  PodcastOwnerContact,
  PodcastShow,
  PrivateFeedRequestContext,
  PrivateFeedToken,
  PrivateFeedTokenAuditEvent,
  PrivateFeedTokenHash,
} from "./types";
import type { PodcastRepository } from "./service";

export class DrizzlePodcastRepository implements PodcastRepository {
  constructor(private readonly db: DbClient) {}

  async findShowBySlug(slug: string): Promise<PodcastShow | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.podcastShows)
      .where(eq(schema.podcastShows.slug, slug))
      .limit(1);

    return row ? showFromRow(row) : undefined;
  }

  async listPublishedEpisodesForShow(showId: string, now: Date): Promise<PodcastEpisode[]> {
    const rows = await this.db
      .select()
      .from(schema.podcastEpisodes)
      .where(
        and(
          eq(schema.podcastEpisodes.showId, showId),
          eq(schema.podcastEpisodes.status, "published"),
          lte(schema.podcastEpisodes.publishedAt, now),
        ),
      )
      .orderBy(desc(schema.podcastEpisodes.publishedAt), desc(schema.podcastEpisodes.createdAt));

    return rows.map(episodeFromRow);
  }

  async findTokenByHash(tokenHash: PrivateFeedTokenHash): Promise<PrivateFeedToken | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.privateFeedTokens)
      .where(eq(schema.privateFeedTokens.tokenHash, tokenHash))
      .limit(1);

    return row ? tokenFromRow(row) : undefined;
  }

  async findTokenById(tokenId: string): Promise<PrivateFeedToken | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.privateFeedTokens)
      .where(eq(schema.privateFeedTokens.id, tokenId))
      .limit(1);

    return row ? tokenFromRow(row) : undefined;
  }

  async saveToken(token: PrivateFeedToken): Promise<PrivateFeedToken> {
    const [row] = await this.db
      .insert(schema.privateFeedTokens)
      .values(toTokenRow(token))
      .onConflictDoUpdate({
        target: schema.privateFeedTokens.id,
        set: toTokenRow(token),
      })
      .returning();

    return tokenFromRow(row);
  }

  async recordAuditEvent(event: PrivateFeedTokenAuditEvent): Promise<void> {
    await this.db.insert(schema.privateFeedTokenAuditEvents).values({
      id: event.id,
      tokenId: event.tokenId,
      kind: event.kind,
      showId: event.showId,
      episodeId: event.episodeId,
      allowed: event.kind === "access_granted" ? true : event.kind === "access_denied" ? false : undefined,
      reason: event.reason,
      requestContext: event.requestContext,
      occurredAt: event.occurredAt,
    });

    if (event.kind === "access_granted") {
      await this.db
        .update(schema.privateFeedTokens)
        .set({ lastAccessedAt: event.occurredAt, updatedAt: event.occurredAt })
        .where(eq(schema.privateFeedTokens.id, event.tokenId));
    }
  }

  async listAccessEventsForToken(
    tokenId: string,
    since: Date,
  ): Promise<PrivateFeedTokenAuditEvent[]> {
    const rows = await this.db
      .select()
      .from(schema.privateFeedTokenAuditEvents)
      .where(
        and(
          eq(schema.privateFeedTokenAuditEvents.tokenId, tokenId),
          sql`${schema.privateFeedTokenAuditEvents.occurredAt} >= ${since}`,
        ),
      )
      .orderBy(desc(schema.privateFeedTokenAuditEvents.occurredAt));

    return rows.map(auditEventFromRow);
  }
}

function showFromRow(row: typeof schema.podcastShows.$inferSelect): PodcastShow {
  return {
    id: row.id,
    publicationId: row.publicationId,
    slug: row.slug,
    title: row.title,
    description: row.description,
    status: row.status,
    language: row.language,
    siteUrl: row.siteUrl,
    feedUrl: row.feedUrl ?? undefined,
    authorName: row.authorName ?? undefined,
    owner: row.owner ? (row.owner as PodcastOwnerContact) : undefined,
    explicit: row.explicit,
    defaultAccessRule: row.defaultAccessRule as PodcastAccessRule,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    publishedAt: row.publishedAt ?? undefined,
  };
}

function episodeFromRow(row: typeof schema.podcastEpisodes.$inferSelect): PodcastEpisode {
  return {
    id: row.id,
    showId: row.showId,
    slug: row.slug,
    guid: row.guid,
    title: row.title,
    description: row.description,
    status: row.status,
    visibility: row.visibility,
    accessRule: row.accessRule ? (row.accessRule as PodcastAccessRule) : undefined,
    enclosure: row.enclosure as PodcastMediaEnclosure,
    seasonNumber: row.seasonNumber ?? undefined,
    episodeNumber: row.episodeNumber ?? undefined,
    explicit: row.explicit,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    publishedAt: row.publishedAt ?? undefined,
  };
}

function tokenFromRow(row: typeof schema.privateFeedTokens.$inferSelect): PrivateFeedToken {
  return {
    id: row.id,
    publicationId: row.publicationId,
    showId: row.showId ?? undefined,
    subscriberId: row.subscriberId ?? undefined,
    userId: row.userId ?? undefined,
    tokenHash: row.tokenHash,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt ?? undefined,
    revokedAt: row.revokedAt ?? undefined,
    rotatedAt: row.rotatedAt ?? undefined,
    rotatedToTokenId: row.rotatedToTokenId ?? undefined,
    lastAccessedAt: row.lastAccessedAt ?? undefined,
  };
}

function toTokenRow(token: PrivateFeedToken): typeof schema.privateFeedTokens.$inferInsert {
  return {
    id: token.id,
    publicationId: token.publicationId,
    showId: token.showId,
    subscriberId: token.subscriberId,
    userId: token.userId,
    tokenHash: token.tokenHash,
    status: token.status,
    expiresAt: token.expiresAt,
    revokedAt: token.revokedAt,
    rotatedAt: token.rotatedAt,
    rotatedToTokenId: token.rotatedToTokenId,
    lastAccessedAt: token.lastAccessedAt,
    createdAt: token.createdAt,
    updatedAt: token.updatedAt,
  };
}

function auditEventFromRow(
  row: typeof schema.privateFeedTokenAuditEvents.$inferSelect,
): PrivateFeedTokenAuditEvent {
  return {
    id: row.id,
    tokenId: row.tokenId,
    kind: row.kind as PrivateFeedTokenAuditEvent["kind"],
    occurredAt: row.occurredAt,
    showId: row.showId ?? undefined,
    episodeId: row.episodeId ?? undefined,
    reason: row.reason ?? undefined,
    requestContext: row.requestContext
      ? (row.requestContext as PrivateFeedRequestContext)
      : undefined,
  };
}
