import "server-only";

import { and, desc, eq, ilike, or, sql } from "drizzle-orm";

import { db, schema } from "@/src/db";
import type { SubscriberRepository } from "./service";
import type {
  SubscriberPreferences,
  SubscriberProviderSync,
  SubscriberRecord,
  SubscriberSearchInput,
  SubscriberSearchResult,
  SubscriberSyncRequest,
  SubscriberStatus,
  SubscriberSyncStatus,
} from "./types";
import { normalizeSubscriberEmail } from "./service";

export class DatabaseSubscriberRepository implements SubscriberRepository {
  async saveSubscriber(subscriber: SubscriberRecord): Promise<SubscriberRecord> {
    try {
      const [stored] = await db
        .insert(schema.subscribers)
        .values(toSubscriberRow(subscriber))
        .onConflictDoUpdate({
          target: schema.subscribers.id,
          set: toSubscriberRow(subscriber),
        })
        .returning();

      return fromSubscriberRow(stored);
    } catch (error) {
      if (!isSubscriberEmailUniqueViolation(error)) {
        throw error;
      }

      const existing = await this.findSubscriberByEmail(
        subscriber.publicationId,
        subscriber.email,
      );

      if (!existing) {
        throw error;
      }

      return existing;
    }
  }

  async findSubscriberById(id: string): Promise<SubscriberRecord | undefined> {
    const [row] = await db
      .select()
      .from(schema.subscribers)
      .where(eq(schema.subscribers.id, id))
      .limit(1);

    return row ? fromSubscriberRow(row) : undefined;
  }

  async findSubscriberByEmail(
    publicationId: string,
    email: string,
  ): Promise<SubscriberRecord | undefined> {
    const [row] = await db
      .select()
      .from(schema.subscribers)
      .where(
        and(
          eq(schema.subscribers.publicationId, publicationId),
          sql`lower(${schema.subscribers.email}) = ${normalizeSubscriberEmail(email)}`,
        ),
      )
      .limit(1);

    return row ? fromSubscriberRow(row) : undefined;
  }

  async listSubscribers(input: SubscriberSearchInput): Promise<SubscriberSearchResult[]> {
    const query = input.query?.trim();
    const where = and(
      eq(schema.subscribers.publicationId, input.publicationId),
      input.status ? eq(schema.subscribers.status, input.status) : undefined,
      query
        ? or(
            ilike(schema.subscribers.email, `%${query}%`),
            sql`${schema.subscribers.metadata}->>'name' ilike ${`%${query}%`}`,
          )
        : undefined,
    );
    const rows = await db
      .select()
      .from(schema.subscribers)
      .where(where)
      .orderBy(desc(schema.subscribers.createdAt))
      .limit(input.limit ?? 50);

    return Promise.all(
      rows.map(async (row) => {
        const subscriber = fromSubscriberRow(row);
        return {
          subscriber,
          preferences: await this.findPreferences(subscriber.id),
          syncs: await this.listProviderSyncs(subscriber.id),
        };
      }),
    );
  }

  async savePreferences(preferences: SubscriberPreferences): Promise<SubscriberPreferences> {
    const [stored] = await db
      .insert(schema.subscriberPreferences)
      .values({
        subscriberId: preferences.subscriberId,
        marketingEmailOptIn: preferences.marketingEmailOptIn,
        productEmailOptIn: preferences.productEmailOptIn,
        commentNotificationOptIn: preferences.commentNotificationOptIn,
        metadata: preferences.metadata,
        updatedAt: preferences.updatedAt,
      })
      .onConflictDoUpdate({
        target: schema.subscriberPreferences.subscriberId,
        set: {
          marketingEmailOptIn: preferences.marketingEmailOptIn,
          productEmailOptIn: preferences.productEmailOptIn,
          commentNotificationOptIn: preferences.commentNotificationOptIn,
          metadata: preferences.metadata,
          updatedAt: preferences.updatedAt,
        },
      })
      .returning();

    return fromPreferencesRow(stored);
  }

  async findPreferences(subscriberId: string): Promise<SubscriberPreferences | undefined> {
    const [row] = await db
      .select()
      .from(schema.subscriberPreferences)
      .where(eq(schema.subscriberPreferences.subscriberId, subscriberId))
      .limit(1);

    return row ? fromPreferencesRow(row) : undefined;
  }

  async saveProviderSync(syncRecord: SubscriberProviderSync): Promise<SubscriberProviderSync> {
    const [stored] = await db
      .insert(schema.subscriberProviderSyncs)
      .values({
        id: syncRecord.id,
        subscriberId: syncRecord.subscriberId,
        provider: syncRecord.provider,
        providerContactId: syncRecord.providerContactId,
        syncStatus: syncRecord.syncStatus,
        lastSyncedAt: syncRecord.lastSyncedAt,
        lastError: syncRecord.lastError,
        metadata: syncRecord.metadata,
        createdAt: syncRecord.createdAt,
        updatedAt: syncRecord.updatedAt,
      })
      .onConflictDoUpdate({
        target: [
          schema.subscriberProviderSyncs.subscriberId,
          schema.subscriberProviderSyncs.provider,
        ],
        set: {
          providerContactId: syncRecord.providerContactId,
          syncStatus: syncRecord.syncStatus,
          lastSyncedAt: syncRecord.lastSyncedAt,
          lastError: syncRecord.lastError,
          metadata: syncRecord.metadata,
          updatedAt: syncRecord.updatedAt,
        },
      })
      .returning();

    return fromSyncRow(stored);
  }

  async findProviderSync(
    subscriberId: string,
    provider: string,
  ): Promise<SubscriberProviderSync | undefined> {
    const [row] = await db
      .select()
      .from(schema.subscriberProviderSyncs)
      .where(
        and(
          eq(schema.subscriberProviderSyncs.subscriberId, subscriberId),
          eq(schema.subscriberProviderSyncs.provider, provider),
        ),
      )
      .limit(1);

    return row ? fromSyncRow(row) : undefined;
  }

  async listProviderSyncs(subscriberId: string): Promise<SubscriberProviderSync[]> {
    const rows = await db
      .select()
      .from(schema.subscriberProviderSyncs)
      .where(eq(schema.subscriberProviderSyncs.subscriberId, subscriberId));

    return rows.map(fromSyncRow);
  }

  async queueSync(request: SubscriberSyncRequest, now: Date): Promise<boolean> {
    const current = await this.findProviderSync(request.subscriberId, request.provider);
    await this.saveProviderSync({
      id: current?.id ?? crypto.randomUUID(),
      subscriberId: request.subscriberId,
      provider: request.provider,
      providerContactId: current?.providerContactId,
      syncStatus: "pending",
      lastSyncedAt: current?.lastSyncedAt,
      lastError: current?.lastError,
      metadata: {
        ...(current?.metadata ?? {}),
        ...(request.metadata ?? {}),
        pendingReason: request.reason,
      },
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    });

    return true;
  }
}

function toSubscriberRow(subscriber: SubscriberRecord) {
  return {
    id: subscriber.id,
    publicationId: subscriber.publicationId,
    userId: subscriber.userId,
    email: subscriber.email,
    status: subscriber.status,
    source: subscriber.source,
    subscribedAt: subscriber.subscribedAt,
    unsubscribedAt: subscriber.unsubscribedAt,
    bouncedAt: subscriber.bouncedAt,
    complainedAt: subscriber.complainedAt,
    suppressedAt: subscriber.suppressedAt,
    metadata: subscriber.metadata,
    createdAt: subscriber.createdAt,
    updatedAt: subscriber.updatedAt,
  };
}

function fromSubscriberRow(row: typeof schema.subscribers.$inferSelect): SubscriberRecord {
  return {
    id: row.id,
    publicationId: row.publicationId,
    userId: row.userId ?? undefined,
    email: row.email,
    status: row.status as SubscriberStatus,
    source: row.source ?? undefined,
    subscribedAt: row.subscribedAt,
    unsubscribedAt: row.unsubscribedAt ?? undefined,
    bouncedAt: row.bouncedAt ?? undefined,
    complainedAt: row.complainedAt ?? undefined,
    suppressedAt: row.suppressedAt ?? undefined,
    metadata: row.metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function fromPreferencesRow(
  row: typeof schema.subscriberPreferences.$inferSelect,
): SubscriberPreferences {
  return {
    subscriberId: row.subscriberId,
    marketingEmailOptIn: row.marketingEmailOptIn,
    productEmailOptIn: row.productEmailOptIn,
    commentNotificationOptIn: row.commentNotificationOptIn,
    metadata: row.metadata,
    updatedAt: row.updatedAt,
  };
}

function fromSyncRow(row: typeof schema.subscriberProviderSyncs.$inferSelect): SubscriberProviderSync {
  return {
    id: row.id,
    subscriberId: row.subscriberId,
    provider: row.provider,
    providerContactId: row.providerContactId ?? undefined,
    syncStatus: row.syncStatus as SubscriberSyncStatus,
    lastSyncedAt: row.lastSyncedAt ?? undefined,
    lastError: row.lastError ?? undefined,
    metadata: row.metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function isSubscriberEmailUniqueViolation(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const postgresError = error as { code?: string; constraint_name?: string; constraint?: string };
  return (
    postgresError.code === "23505" &&
    (postgresError.constraint_name === "subscribers_publication_email_unique" ||
      postgresError.constraint === "subscribers_publication_email_unique")
  );
}
