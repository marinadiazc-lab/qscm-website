import "server-only";

import { and, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";

import { db, schema } from "@/src/db";
import { getDefaultPublicationId } from "@/src/domains/subscribers/runtime";
import type { AuthUser } from "../auth";
import type {
  EntitlementKey,
  SubscriptionStatus,
  TierId,
} from "./types";
import type {
  SubscriptionEntitlementState,
  SubscriptionTierChange,
} from "./entitlements";

export interface LocalSubscriptionEntitlementLookup {
  subscription: SubscriptionEntitlementState | null;
  isFreeSubscriber: boolean;
}

export async function getLocalSubscriptionEntitlementForUser(
  user: Pick<AuthUser, "id" | "email">,
  now = new Date(),
): Promise<LocalSubscriptionEntitlementLookup> {
  if (!process.env.DATABASE_URL) {
    return {
      subscription: null,
      isFreeSubscriber: false,
    };
  }

  const publicationId = await getDefaultPublicationId();
  const subscriberIds = await getSubscriberIdsForUser(publicationId, user);
  const [subscription, grants] = await Promise.all([
    getLatestLocalSubscription(publicationId, user.id, subscriberIds),
    getEntitlementGrantState(publicationId, user.id, subscriberIds, now),
  ]);

  return {
    subscription: mergeSubscriptionAndGrants(subscription, grants),
    isFreeSubscriber: subscriberIds.length > 0,
  };
}

async function getSubscriberIdsForUser(
  publicationId: string,
  user: Pick<AuthUser, "id" | "email">,
) {
  const rows = await db
    .select({ id: schema.subscribers.id })
    .from(schema.subscribers)
    .where(
      and(
        eq(schema.subscribers.publicationId, publicationId),
        eq(schema.subscribers.status, "active"),
        or(
          eq(schema.subscribers.userId, user.id),
          sql`lower(${schema.subscribers.email}) = ${user.email.trim().toLowerCase()}`,
        ),
      ),
    );

  return rows.map((row) => row.id);
}

async function getLatestLocalSubscription(
  publicationId: string,
  userId: string,
  subscriberIds: readonly string[],
): Promise<SubscriptionEntitlementState | null> {
  const [row] = await db
    .select({
      id: schema.subscriptions.id,
      tierId: schema.subscriptions.tierId,
      tierSlug: schema.subscriptionTiers.slug,
      tierEntitlementKeys: schema.subscriptionTiers.entitlementKeys,
      status: schema.subscriptions.status,
      cancelAtPeriodEnd: schema.subscriptions.cancelAtPeriodEnd,
      currentPeriodEnd: schema.subscriptions.currentPeriodEndsAt,
      trialEnd: schema.subscriptions.trialEndsAt,
      accessEndsAt: schema.subscriptions.accessEndsAt,
      updatedAt: schema.subscriptions.updatedAt,
      metadata: schema.subscriptions.metadata,
    })
    .from(schema.subscriptions)
    .leftJoin(
      schema.subscriptionTiers,
      eq(schema.subscriptions.tierId, schema.subscriptionTiers.id),
    )
    .where(
      and(
        eq(schema.subscriptions.publicationId, publicationId),
        or(
          eq(schema.subscriptions.userId, userId),
          ...subscriberIds.map((subscriberId) =>
            eq(schema.subscriptions.subscriberId, subscriberId),
          ),
        ),
      ),
    )
    .orderBy(desc(schema.subscriptions.updatedAt), desc(schema.subscriptions.createdAt))
    .limit(1);

  if (!row) {
    return null;
  }

  const tierIds = uniqueValues([row.tierId, row.tierSlug]);
  const entitlementKeys = uniqueValues([
    ...(row.tierEntitlementKeys ?? []),
    ...tierIds.map((tierId) => `tier:${tierId}`),
  ]) as EntitlementKey[];

  return {
    status: row.status as SubscriptionStatus,
    tierId: row.tierSlug ?? row.tierId ?? undefined,
    tierIds,
    entitlementKeys,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    currentPeriodEnd: row.currentPeriodEnd,
    trialEnd: row.trialEnd,
    accessEndsAt: row.accessEndsAt,
    statusChangedAt: row.updatedAt,
    scheduledTierChange: scheduledTierChangeFromMetadata(row.metadata),
  };
}

async function getEntitlementGrantState(
  publicationId: string,
  userId: string,
  subscriberIds: readonly string[],
  now: Date,
) {
  const subjectWhere = or(
    eq(schema.entitlementGrants.userId, userId),
    ...subscriberIds.map((subscriberId) =>
      eq(schema.entitlementGrants.subscriberId, subscriberId),
    ),
  );

  const activeRows = await db
    .select({
      id: schema.entitlementGrants.id,
      entitlementKey: schema.entitlementGrants.entitlementKey,
      source: schema.entitlementGrants.source,
      tierId: schema.entitlementGrants.tierId,
      tierSlug: schema.subscriptionTiers.slug,
      tierEntitlementKeys: schema.subscriptionTiers.entitlementKeys,
      endsAt: schema.entitlementGrants.endsAt,
    })
    .from(schema.entitlementGrants)
    .leftJoin(
      schema.subscriptionTiers,
      eq(schema.entitlementGrants.tierId, schema.subscriptionTiers.id),
    )
    .where(
      and(
        eq(schema.entitlementGrants.publicationId, publicationId),
        subjectWhere,
        isNull(schema.entitlementGrants.revokedAt),
        lte(schema.entitlementGrants.startsAt, now),
        or(isNull(schema.entitlementGrants.endsAt), gt(schema.entitlementGrants.endsAt, now)),
      ),
    );

  const revokedRows = await db
    .select({ id: schema.entitlementGrants.id })
    .from(schema.entitlementGrants)
    .where(
      and(
        eq(schema.entitlementGrants.publicationId, publicationId),
        subjectWhere,
        sql`${schema.entitlementGrants.revokedAt} is not null`,
      ),
    );

  const tierIds = uniqueValues(
    activeRows.flatMap((row) => [row.tierId, row.tierSlug]),
  );
  const entitlementKeys = uniqueValues(
    activeRows.flatMap((row) => [
      row.entitlementKey,
      ...(row.tierEntitlementKeys ?? []),
      row.tierId ? `tier:${row.tierId}` : undefined,
      row.tierSlug ? `tier:${row.tierSlug}` : undefined,
    ]),
  ) as EntitlementKey[];
  const compedGrantIds = activeRows
    .filter((row) => row.source === "admin_comped")
    .map((row) => row.id);

  return {
    tierIds,
    entitlementKeys,
    compedGrantIds,
    revokedGrantIds: revokedRows.map((row) => row.id),
    accessEndsAt: activeRows.some((row) => row.endsAt === null)
      ? null
      : earliestDate(activeRows.map((row) => row.endsAt)),
  };
}

function mergeSubscriptionAndGrants(
  subscription: SubscriptionEntitlementState | null,
  grants: {
    tierIds: TierId[];
    entitlementKeys: EntitlementKey[];
    compedGrantIds: string[];
    revokedGrantIds: string[];
    accessEndsAt: Date | null;
  },
): SubscriptionEntitlementState | null {
  if (!subscription && grants.entitlementKeys.length === 0) {
    return null;
  }

  const status = grants.entitlementKeys.length > 0 && isGrantOverrideStatus(subscription?.status)
    ? "comped"
    : subscription?.status;
  const grantOverridesSubscription = status === "comped" && subscription?.status !== "comped";

  return {
    ...(subscription ?? {}),
    status: status ?? "comped",
    tierIds: uniqueValues([...(subscription?.tierIds ?? []), ...grants.tierIds]),
    entitlementKeys: uniqueValues([
      ...(subscription?.entitlementKeys ?? []),
      ...grants.entitlementKeys,
    ]),
    compedGrantIds: grants.compedGrantIds,
    revokedGrantIds: grants.revokedGrantIds,
    accessEndsAt: grantOverridesSubscription
      ? grants.accessEndsAt
      : subscription?.accessEndsAt ?? grants.accessEndsAt,
  };
}

function isGrantOverrideStatus(status: SubscriptionStatus | undefined) {
  return !status || ["free", "expired", "incomplete", "incomplete_expired", "paused"].includes(status);
}

function scheduledTierChangeFromMetadata(
  metadata: Record<string, unknown>,
): SubscriptionTierChange | null {
  const value = metadata.scheduledTierChange;

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const input = value as Record<string, unknown>;
  const effectiveAt = input.effectiveAt;
  const toTierId = input.toTierId;
  const accessPolicy = input.accessPolicy;

  if (
    typeof toTierId !== "string" ||
    !(effectiveAt instanceof Date || typeof effectiveAt === "string" || typeof effectiveAt === "number") ||
    (accessPolicy !== "immediate" && accessPolicy !== "period_end")
  ) {
    return null;
  }

  return {
    fromTierId: typeof input.fromTierId === "string" ? input.fromTierId : undefined,
    toTierId,
    effectiveAt,
    accessPolicy,
  };
}

function earliestDate(dates: readonly (Date | null)[]) {
  return (
    dates
      .filter((date): date is Date => Boolean(date))
      .sort((left, right) => left.getTime() - right.getTime())[0] ?? null
  );
}

function uniqueValues<T>(values: readonly (T | null | undefined)[]) {
  return Array.from(new Set(values.filter((value): value is T => value !== null && value !== undefined)));
}
