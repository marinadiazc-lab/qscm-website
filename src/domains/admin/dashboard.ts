import "server-only";

import { and, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";

import { db, schema } from "@/src/db";

const subscriberStatuses = [
  "active",
  "unsubscribed",
  "bounced",
  "complained",
  "suppressed",
] as const;

const moderationStatuses = ["approved", "suspicious", "blocked", "removed"] as const;

export type AdminMetric = {
  label: string;
  value: string;
  detail: string;
};

export type AdminPublicationSummary = {
  id: string;
  slug: string;
  name: string;
};

export type AdminSubscriberRow = {
  id: string;
  email: string;
  name: string;
  status: string;
  source: string;
  userId: string;
  syncSummary: string;
  commentCount: number;
  subscriptionSummary: string;
  createdAt: Date;
  updatedAt: Date;
};

export type AdminTierRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: string;
  entitlementKeys: string[];
  prices: AdminTierPriceRow[];
};

export type AdminTierPriceRow = {
  id: string;
  interval: string;
  amountCents: number;
  currency: string;
  activeForCheckout: boolean;
  provider: string;
  providerPriceId: string;
};

export type AdminAccessGrantRow = {
  id: string;
  subject: string;
  entitlementKey: string;
  source: string;
  tierName: string;
  startsAt: Date;
  endsAt?: Date;
  revokedAt?: Date;
  createdAt: Date;
};

export type AdminCommentRow = {
  id: string;
  postSlug: string;
  body: string;
  author: string;
  email: string;
  status: string;
  auditCount: number;
  createdAt: Date;
  publishedAt?: Date;
};

export type AdminMediaRow = {
  id: string;
  kind: string;
  status: string;
  provider: string;
  objectKey: string;
  publicUrl: string;
  mimeType: string;
  byteLength?: number;
  createdAt: Date;
};

export type AdminPodcastShowRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  episodeCount: number;
  publishedEpisodeCount: number;
  tokenCount: number;
  updatedAt: Date;
};

export type AdminOperationalLogRow = {
  id: string;
  kind: "audit" | "webhook";
  provider: string;
  action: string;
  subject: string;
  status: string;
  detail: string;
  occurredAt: Date;
};

export async function getAdminPublication(): Promise<AdminPublicationSummary | undefined> {
  const [publication] = await db
    .select({
      id: schema.publications.id,
      slug: schema.publications.slug,
      name: schema.publications.name,
    })
    .from(schema.publications)
    .where(eq(schema.publications.slug, "qscm"))
    .limit(1);

  return publication;
}

export async function getDashboardMetrics(
  publicationId: string,
): Promise<AdminMetric[]> {
  const [
    totalSubscribers,
    activeSubscribers,
    paidSubscriptions,
    pendingComments,
    failedEmailSyncs,
    failedWebhooks,
  ] = await Promise.all([
    countRows(schema.subscribers, eq(schema.subscribers.publicationId, publicationId)),
    countRows(
      schema.subscribers,
      and(
        eq(schema.subscribers.publicationId, publicationId),
        eq(schema.subscribers.status, "active"),
      ),
    ),
    countRows(
      schema.subscriptions,
      and(
        eq(schema.subscriptions.publicationId, publicationId),
        sql`${schema.subscriptions.status} in ('trialing', 'active', 'grace_period', 'comped')`,
      ),
    ),
    countRows(schema.comments, eq(schema.comments.moderationStatus, "suspicious")),
    countRows(
      schema.subscriberProviderSyncs,
      eq(schema.subscriberProviderSyncs.syncStatus, "failed"),
    ),
    countRows(schema.webhookEventLogs, eq(schema.webhookEventLogs.state, "failed")),
  ]);

  return [
    {
      label: "Subscribers",
      value: formatCount(totalSubscribers),
      detail: `${formatCount(activeSubscribers)} active`,
    },
    {
      label: "Paid access",
      value: formatCount(paidSubscriptions),
      detail: "Local subscription/entitlement state",
    },
    {
      label: "Revenue",
      value: "Pending",
      detail: "Stripe reporting is not wired yet",
    },
    {
      label: "Comments pending",
      value: formatCount(pendingComments),
      detail: "Suspicious moderation queue",
    },
    {
      label: "Email failures",
      value: formatCount(failedEmailSyncs),
      detail: "Failed subscriber provider syncs",
    },
    {
      label: "Webhook failures",
      value: formatCount(failedWebhooks),
      detail: "Failed operational webhook logs",
    },
  ];
}

export async function listAdminSubscribers(input: {
  publicationId: string;
  query?: string;
  status?: string;
  limit?: number;
}): Promise<AdminSubscriberRow[]> {
  const query = input.query?.trim();
  const status = parseSubscriberStatus(input.status);
  const where = and(
    eq(schema.subscribers.publicationId, input.publicationId),
    status ? eq(schema.subscribers.status, status) : undefined,
    query
      ? or(
          ilike(schema.subscribers.email, `%${query}%`),
          sql`${schema.subscribers.metadata}->>'name' ilike ${`%${query}%`}`,
        )
      : undefined,
  );

  const rows = await db
    .select({
      id: schema.subscribers.id,
      email: schema.subscribers.email,
      metadata: schema.subscribers.metadata,
      status: schema.subscribers.status,
      source: schema.subscribers.source,
      userId: schema.subscribers.userId,
      createdAt: schema.subscribers.createdAt,
      updatedAt: schema.subscribers.updatedAt,
    })
    .from(schema.subscribers)
    .where(where)
    .orderBy(desc(schema.subscribers.createdAt))
    .limit(input.limit ?? 50);

  return Promise.all(
    rows.map(async (row) => {
      const [syncs, comments, subscriptions] = await Promise.all([
        db
          .select({
            provider: schema.subscriberProviderSyncs.provider,
            syncStatus: schema.subscriberProviderSyncs.syncStatus,
          })
          .from(schema.subscriberProviderSyncs)
          .where(eq(schema.subscriberProviderSyncs.subscriberId, row.id)),
        countRows(schema.comments, eq(schema.comments.authorEmail, row.email)),
        db
          .select({
            status: schema.subscriptions.status,
            source: schema.subscriptions.source,
            tierName: schema.subscriptionTiers.name,
          })
          .from(schema.subscriptions)
          .leftJoin(
            schema.subscriptionTiers,
            eq(schema.subscriptions.tierId, schema.subscriptionTiers.id),
          )
          .where(eq(schema.subscriptions.subscriberId, row.id))
          .orderBy(desc(schema.subscriptions.createdAt))
          .limit(1),
      ]);

      const latestSubscription = subscriptions[0];

      return {
        id: row.id,
        email: row.email,
        name: stringFromMetadata(row.metadata, "name"),
        status: row.status,
        source: row.source ?? "",
        userId: row.userId ?? "",
        syncSummary:
          syncs.length > 0
            ? syncs.map((sync) => `${sync.provider}: ${sync.syncStatus}`).join(", ")
            : "No provider sync",
        commentCount: comments,
        subscriptionSummary: latestSubscription
          ? [
              latestSubscription.tierName ?? latestSubscription.source,
              latestSubscription.status,
            ].join(" / ")
          : "No paid record",
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    }),
  );
}

export async function listAdminTiers(publicationId: string): Promise<AdminTierRow[]> {
  const tiers = await db
    .select()
    .from(schema.subscriptionTiers)
    .where(eq(schema.subscriptionTiers.publicationId, publicationId))
    .orderBy(schema.subscriptionTiers.sortOrder, schema.subscriptionTiers.name);

  return Promise.all(
    tiers.map(async (tier) => ({
      id: tier.id,
      slug: tier.slug,
      name: tier.name,
      description: tier.description ?? "",
      status: tier.status,
      entitlementKeys: tier.entitlementKeys,
      prices: await listTierPrices(tier.id),
    })),
  );
}

export async function listAccessGrants(
  publicationId: string,
): Promise<AdminAccessGrantRow[]> {
  const rows = await db
    .select({
      id: schema.entitlementGrants.id,
      subscriberEmail: schema.subscribers.email,
      userEmail: schema.users.email,
      entitlementKey: schema.entitlementGrants.entitlementKey,
      source: schema.entitlementGrants.source,
      tierName: schema.subscriptionTiers.name,
      startsAt: schema.entitlementGrants.startsAt,
      endsAt: schema.entitlementGrants.endsAt,
      revokedAt: schema.entitlementGrants.revokedAt,
      createdAt: schema.entitlementGrants.createdAt,
    })
    .from(schema.entitlementGrants)
    .leftJoin(
      schema.subscribers,
      eq(schema.entitlementGrants.subscriberId, schema.subscribers.id),
    )
    .leftJoin(schema.users, eq(schema.entitlementGrants.userId, schema.users.id))
    .leftJoin(
      schema.subscriptionTiers,
      eq(schema.entitlementGrants.tierId, schema.subscriptionTiers.id),
    )
    .where(eq(schema.entitlementGrants.publicationId, publicationId))
    .orderBy(desc(schema.entitlementGrants.createdAt))
    .limit(50);

  return rows.map((row) => ({
    id: row.id,
    subject: row.subscriberEmail ?? row.userEmail ?? "Unlinked grant",
    entitlementKey: row.entitlementKey,
    source: row.source,
    tierName: row.tierName ?? "",
    startsAt: row.startsAt,
    endsAt: row.endsAt ?? undefined,
    revokedAt: row.revokedAt ?? undefined,
    createdAt: row.createdAt,
  }));
}

export async function listAdminComments(status = "suspicious"): Promise<AdminCommentRow[]> {
  const moderationStatus = parseModerationStatus(status) ?? "suspicious";
  const rows = await db
    .select({
      id: schema.comments.id,
      postSlug: schema.postMetadata.slug,
      body: schema.comments.body,
      author: schema.comments.authorDisplayName,
      email: schema.comments.authorEmail,
      status: schema.comments.moderationStatus,
      createdAt: schema.comments.createdAt,
      publishedAt: schema.comments.publishedAt,
    })
    .from(schema.comments)
    .innerJoin(schema.postMetadata, eq(schema.comments.postId, schema.postMetadata.id))
    .where(eq(schema.comments.moderationStatus, moderationStatus))
    .orderBy(desc(schema.comments.createdAt))
    .limit(50);

  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      postSlug: row.postSlug,
      body: row.body,
      author: row.author,
      email: row.email ?? "",
      status: row.status,
      auditCount: await countRows(
        schema.moderationAuditEntries,
        eq(schema.moderationAuditEntries.commentId, row.id),
      ),
      createdAt: row.createdAt,
      publishedAt: row.publishedAt ?? undefined,
    })),
  );
}

export async function listAdminMedia(
  publicationId: string,
): Promise<AdminMediaRow[]> {
  const rows = await db
    .select()
    .from(schema.mediaAssets)
    .where(eq(schema.mediaAssets.publicationId, publicationId))
    .orderBy(desc(schema.mediaAssets.createdAt))
    .limit(60);

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    status: row.status,
    provider: row.provider,
    objectKey: row.objectKey,
    publicUrl: row.publicUrl ?? "",
    mimeType: row.mimeType ?? "",
    byteLength: row.byteLength ?? undefined,
    createdAt: row.createdAt,
  }));
}

export async function listAdminPodcastShows(
  publicationId: string,
): Promise<AdminPodcastShowRow[]> {
  const shows = await db
    .select()
    .from(schema.podcastShows)
    .where(eq(schema.podcastShows.publicationId, publicationId))
    .orderBy(desc(schema.podcastShows.updatedAt));

  return Promise.all(
    shows.map(async (show) => {
      const [episodeCount, publishedEpisodeCount, tokenCount] = await Promise.all([
        countRows(schema.podcastEpisodes, eq(schema.podcastEpisodes.showId, show.id)),
        countRows(
          schema.podcastEpisodes,
          and(
            eq(schema.podcastEpisodes.showId, show.id),
            eq(schema.podcastEpisodes.status, "published"),
          ),
        ),
        countRows(schema.privateFeedTokens, eq(schema.privateFeedTokens.showId, show.id)),
      ]);

      return {
        id: show.id,
        slug: show.slug,
        title: show.title,
        status: show.status,
        episodeCount,
        publishedEpisodeCount,
        tokenCount,
        updatedAt: show.updatedAt,
      };
    }),
  );
}

export async function listOperationalLogs(): Promise<AdminOperationalLogRow[]> {
  const [webhooks, audits] = await Promise.all([
    db
      .select()
      .from(schema.webhookEventLogs)
      .orderBy(desc(schema.webhookEventLogs.receivedAt))
      .limit(25),
    db.select().from(schema.auditLogs).orderBy(desc(schema.auditLogs.createdAt)).limit(25),
  ]);

  return [
    ...webhooks.map((row) => ({
      id: row.id,
      kind: "webhook" as const,
      provider: row.provider,
      action: row.eventType,
      subject: row.providerEventId,
      status: row.state,
      detail: row.lastError ? redactSensitiveText(row.lastError) : `Attempts: ${row.attemptCount}`,
      occurredAt: row.receivedAt,
    })),
    ...audits.map((row) => ({
      id: row.id,
      kind: "audit" as const,
      provider: "app",
      action: row.action,
      subject: [row.subjectType, row.subjectId].filter(Boolean).join(":"),
      status: row.sensitivity,
      detail: redactSensitiveText(JSON.stringify(row.metadata)),
      occurredAt: row.createdAt,
    })),
  ]
    .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
    .slice(0, 50);
}

async function listTierPrices(tierId: string): Promise<AdminTierPriceRow[]> {
  const rows = await db
    .select()
    .from(schema.tierPrices)
    .where(eq(schema.tierPrices.tierId, tierId))
    .orderBy(schema.tierPrices.interval);

  return rows.map((row) => ({
    id: row.id,
    interval: row.interval,
    amountCents: row.amountCents,
    currency: row.currency,
    activeForCheckout: row.activeForCheckout,
    provider: row.provider ?? "",
    providerPriceId: row.providerPriceId ?? "",
  }));
}

async function countRows(
  table: AnyPgTable,
  where?: SQL<unknown>,
): Promise<number> {
  const query = db
    .select({ value: count() })
    .from(table)
    .$dynamic();
  const [row] = where ? await query.where(where) : await query;

  return row?.value ?? 0;
}

function parseSubscriberStatus(value: string | undefined) {
  const normalized = value?.trim();

  return subscriberStatuses.find((status) => status === normalized);
}

function parseModerationStatus(value: string | undefined) {
  const normalized = value?.trim();

  return moderationStatuses.find((status) => status === normalized);
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function stringFromMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];

  return typeof value === "string" ? value : "";
}

function redactSensitiveText(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/(token|secret|password|authorization)["':=\s]+[^"',\s}]+/gi, "$1: [redacted]");
}
