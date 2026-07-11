import type {
  EntitlementKey,
  TierId,
} from "./types";
import {
  decideSubscriptionEntitlement,
  type EntitlementPolicy,
  type SubscriptionEntitlementState,
  type SubscriptionTierChange,
} from "./entitlements";

export interface LocalEntitlementGrantRow {
  id: string;
  publicationId?: string | null;
  userId?: string | null;
  subscriberId?: string | null;
  entitlementKey: string;
  source: string;
  tierId?: string | null;
  tierSlug?: string | null;
  tierEntitlementKeys?: readonly string[] | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  revokedAt?: Date | null;
}

export interface LocalEntitlementGrantLookup {
  publicationId?: string;
  userId: string;
  subscriberIds: readonly string[];
  now: Date;
}

export interface LocalEntitlementGrantState {
  tierIds: TierId[];
  entitlementKeys: EntitlementKey[];
  compedGrantIds: string[];
  revokedGrantIds: string[];
  accessEndsAt: Date | null;
}

export interface LocalEntitlementMergeOptions extends EntitlementPolicy {}

export function selectLocalEntitlementGrantState(
  rows: readonly LocalEntitlementGrantRow[],
  lookup: LocalEntitlementGrantLookup,
): LocalEntitlementGrantState {
  return projectLocalEntitlementGrantState({
    activeRows: rows.filter((row) => isActiveLocalEntitlementGrant(row, lookup)),
    revokedRows: rows.filter((row) => isRevokedLocalEntitlementGrant(row, lookup)),
  });
}

export function projectLocalEntitlementGrantState(input: {
  activeRows: readonly LocalEntitlementGrantRow[];
  revokedRows: readonly Pick<LocalEntitlementGrantRow, "id">[];
}): LocalEntitlementGrantState {
  const tierIds = uniqueValues(
    input.activeRows.flatMap((row) => [row.tierId, row.tierSlug]),
  );
  const entitlementKeys = uniqueValues(
    input.activeRows.flatMap((row) => [
      row.entitlementKey,
      ...(row.tierEntitlementKeys ?? []),
      row.tierId ? `tier:${row.tierId}` : undefined,
      row.tierSlug ? `tier:${row.tierSlug}` : undefined,
    ]),
  ) as EntitlementKey[];
  const compedGrantIds = input.activeRows
    .filter((row) => row.source === "admin_comped")
    .map((row) => row.id);

  return {
    tierIds,
    entitlementKeys,
    compedGrantIds,
    revokedGrantIds: input.revokedRows.map((row) => row.id),
    accessEndsAt: input.activeRows.some((row) => row.endsAt === null)
      ? null
      : earliestDate(input.activeRows.map((row) => row.endsAt ?? null)),
  };
}

export function mergeSubscriptionAndEntitlementGrants(
  subscription: SubscriptionEntitlementState | null,
  grants: LocalEntitlementGrantState,
  options: LocalEntitlementMergeOptions = {},
): SubscriptionEntitlementState | null {
  if (!subscription && grants.entitlementKeys.length === 0) {
    return null;
  }

  const grantOverridesSubscription =
    grants.entitlementKeys.length > 0 &&
    !decideSubscriptionEntitlement(subscription, options).allowed;
  const status = grantOverridesSubscription ? "comped" : subscription?.status;

  return {
    ...(subscription ?? {}),
    status: status ?? "comped",
    tierId: grantOverridesSubscription
      ? grants.tierIds[0]
      : subscription?.tierId ?? grants.tierIds[0],
    tierIds: grantOverridesSubscription
      ? grants.tierIds
      : uniqueValues([...(subscription?.tierIds ?? []), ...grants.tierIds]),
    entitlementKeys: grantOverridesSubscription
      ? grants.entitlementKeys
      : uniqueValues([
          ...(subscription?.entitlementKeys ?? []),
          ...grants.entitlementKeys,
        ]),
    scheduledTierChange: grantOverridesSubscription
      ? undefined
      : subscription?.scheduledTierChange,
    compedGrantIds: grants.compedGrantIds,
    revokedGrantIds: grants.revokedGrantIds,
    accessEndsAt: grantOverridesSubscription
      ? grants.accessEndsAt
      : subscription?.accessEndsAt ?? grants.accessEndsAt,
  };
}

export function scheduledTierChangeFromMetadata(
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

function isActiveLocalEntitlementGrant(
  row: LocalEntitlementGrantRow,
  lookup: LocalEntitlementGrantLookup,
) {
  return (
    isLocalEntitlementGrantForSubject(row, lookup) &&
    !row.revokedAt &&
    (!row.startsAt || row.startsAt.getTime() <= lookup.now.getTime()) &&
    (!row.endsAt || row.endsAt.getTime() > lookup.now.getTime())
  );
}

function isRevokedLocalEntitlementGrant(
  row: LocalEntitlementGrantRow,
  lookup: LocalEntitlementGrantLookup,
) {
  return isLocalEntitlementGrantForSubject(row, lookup) && Boolean(row.revokedAt);
}

function isLocalEntitlementGrantForSubject(
  row: LocalEntitlementGrantRow,
  lookup: LocalEntitlementGrantLookup,
) {
  if (lookup.publicationId && row.publicationId && row.publicationId !== lookup.publicationId) {
    return false;
  }

  return (
    row.userId === lookup.userId ||
    (row.subscriberId ? lookup.subscriberIds.includes(row.subscriberId) : false)
  );
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
