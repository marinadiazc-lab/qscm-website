import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const authProviderEnum = pgEnum("auth_provider", [
  "google",
  "facebook",
  "apple",
  "email_magic_link",
]);
export const authRoleEnum = pgEnum("auth_role", ["reader", "author", "admin"]);
export const userStatusEnum = pgEnum("auth_user_status", ["active", "disabled"]);
export const accountStatusEnum = pgEnum("auth_account_status", [
  "active",
  "disabled",
  "unlinked",
]);
export const sessionStatusEnum = pgEnum("auth_session_status", [
  "active",
  "expired",
  "revoked",
]);
export const magicLinkStatusEnum = pgEnum("magic_link_request_status", [
  "requested",
  "consumed",
  "expired",
  "revoked",
]);
export const publicationStatusEnum = pgEnum("publication_status", [
  "draft",
  "active",
  "archived",
]);
export const subscriberStatusEnum = pgEnum("subscriber_status", [
  "active",
  "unsubscribed",
  "bounced",
  "complained",
  "suppressed",
]);
export const providerSyncStatusEnum = pgEnum("provider_sync_status", [
  "pending",
  "synced",
  "failed",
  "disabled",
]);
export const tierStatusEnum = pgEnum("tier_status", ["active", "archived"]);
export const billingIntervalEnum = pgEnum("billing_interval", ["month", "year"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "free",
  "trialing",
  "active",
  "past_due",
  "grace_period",
  "canceled",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "paused",
  "expired",
  "comped",
]);
export const subscriptionSourceEnum = pgEnum("subscription_source", [
  "stripe",
  "free",
  "gift",
  "admin_comped",
]);
export const entitlementGrantSourceEnum = pgEnum("entitlement_grant_source", [
  "subscription",
  "gift",
  "admin_comped",
  "migration",
]);
export const postStatusEnum = pgEnum("post_status", ["draft", "published"]);
export const postVisibilityEnum = pgEnum("post_visibility", [
  "public",
  "free_subscribers",
  "paid_any",
  "specific_tiers",
]);
export const moderationStatusEnum = pgEnum("moderation_status", [
  "approved",
  "suspicious",
  "blocked",
  "removed",
]);
export const commentAuthorKindEnum = pgEnum("comment_author_kind", [
  "anonymous",
  "registered_user",
]);
export const reactionKindEnum = pgEnum("reaction_kind", ["like"]);
export const shareChannelEnum = pgEnum("share_channel", [
  "copy_link",
  "email",
  "facebook",
  "linkedin",
  "x",
  "other",
]);
export const podcastShowStatusEnum = pgEnum("podcast_show_status", [
  "draft",
  "active",
  "archived",
]);
export const podcastEpisodeStatusEnum = pgEnum("podcast_episode_status", [
  "draft",
  "scheduled",
  "published",
  "archived",
]);
export const podcastEpisodeVisibilityEnum = pgEnum("podcast_episode_visibility", [
  "public",
  "private",
  "unlisted",
]);
export const privateFeedTokenStatusEnum = pgEnum("private_feed_token_status", [
  "active",
  "revoked",
  "rotated",
  "expired",
]);
export const mediaAssetKindEnum = pgEnum("media_asset_kind", [
  "image",
  "audio",
  "video",
  "document",
  "other",
]);
export const mediaAssetStatusEnum = pgEnum("media_asset_status", [
  "pending",
  "ready",
  "failed",
  "archived",
]);
export const webhookLogStateEnum = pgEnum("webhook_log_state", [
  "received",
  "processing",
  "processed",
  "ignored",
  "failed",
]);

export const publications = pgTable(
  "publications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    status: publicationStatusEnum("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugUnique: uniqueIndex("publications_slug_unique").on(table.slug),
  }),
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    status: userStatusEnum("status").notNull().default("active"),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailUnique: uniqueIndex("users_email_unique").on(sql`lower(${table.email})`),
  }),
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: authRoleEnum("role").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    grantedByUserId: uuid("granted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.role] }),
  }),
);

export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: authProviderEnum("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    email: text("email"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    status: accountStatusEnum("status").notNull().default("active"),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
    lastAuthenticatedAt: timestamp("last_authenticated_at", { withTimezone: true }),
    unlinkedAt: timestamp("unlinked_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    providerAccountUnique: uniqueIndex("auth_accounts_provider_account_unique").on(
      table.provider,
      table.providerAccountId,
    ),
    userIdx: index("auth_accounts_user_id_idx").on(table.userId),
  }),
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    status: sessionStatusEnum("status").notNull().default("active"),
    requestContext: jsonb("request_context").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex("auth_sessions_token_hash_unique").on(table.tokenHash),
    userStatusIdx: index("auth_sessions_user_status_idx").on(table.userId, table.status),
  }),
);

export const magicLinkRequests = pgTable(
  "magic_link_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    status: magicLinkStatusEnum("status").notNull().default("requested"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    sessionId: uuid("session_id").references(() => authSessions.id, {
      onDelete: "set null",
    }),
    redirectTo: text("redirect_to"),
    requestContext: jsonb("request_context").$type<Record<string, unknown>>(),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex("magic_link_requests_token_hash_unique").on(
      table.tokenHash,
    ),
    emailStatusIdx: index("magic_link_requests_email_status_idx").on(
      sql`lower(${table.email})`,
      table.status,
    ),
  }),
);

export const accountLinkingRecords = pgTable(
  "account_linking_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    provider: authProviderEnum("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    email: text("email"),
    decisionOutcome: text("decision_outcome").notNull(),
    decisionReason: text("decision_reason").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    providerAccountIdx: index("account_linking_records_provider_account_idx").on(
      table.provider,
      table.providerAccountId,
    ),
  }),
);

export const subscribers = pgTable(
  "subscribers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    status: subscriberStatusEnum("status").notNull().default("active"),
    source: text("source"),
    subscribedAt: timestamp("subscribed_at", { withTimezone: true }).notNull().defaultNow(),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    bouncedAt: timestamp("bounced_at", { withTimezone: true }),
    complainedAt: timestamp("complained_at", { withTimezone: true }),
    suppressedAt: timestamp("suppressed_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    publicationEmailUnique: uniqueIndex("subscribers_publication_email_unique").on(
      table.publicationId,
      sql`lower(${table.email})`,
    ),
    userIdx: index("subscribers_user_id_idx").on(table.userId),
  }),
);

export const subscriberPreferences = pgTable(
  "subscriber_preferences",
  {
    subscriberId: uuid("subscriber_id")
      .primaryKey()
      .references(() => subscribers.id, { onDelete: "cascade" }),
    marketingEmailOptIn: boolean("marketing_email_opt_in").notNull().default(true),
    productEmailOptIn: boolean("product_email_opt_in").notNull().default(true),
    commentNotificationOptIn: boolean("comment_notification_opt_in").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const subscriberProviderSyncs = pgTable(
  "subscriber_provider_syncs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriberId: uuid("subscriber_id")
      .notNull()
      .references(() => subscribers.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerContactId: text("provider_contact_id"),
    syncStatus: providerSyncStatusEnum("sync_status").notNull().default("pending"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastError: text("last_error"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    subscriberProviderUnique: uniqueIndex("subscriber_provider_syncs_unique").on(
      table.subscriberId,
      table.provider,
    ),
    providerContactIdx: index("subscriber_provider_syncs_contact_idx").on(
      table.provider,
      table.providerContactId,
    ),
  }),
);

export const subscriptionTiers = pgTable(
  "subscription_tiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    status: tierStatusEnum("status").notNull().default("active"),
    sortOrder: integer("sort_order").notNull().default(0),
    defaultGracePeriodDays: integer("default_grace_period_days").notNull().default(0),
    entitlementKeys: text("entitlement_keys").array().notNull().default(sql`'{}'::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    publicationSlugUnique: uniqueIndex("subscription_tiers_publication_slug_unique").on(
      table.publicationId,
      table.slug,
    ),
  }),
);

export const tierPrices = pgTable(
  "tier_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tierId: uuid("tier_id")
      .notNull()
      .references(() => subscriptionTiers.id, { onDelete: "cascade" }),
    interval: billingIntervalEnum("interval").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    activeForCheckout: boolean("active_for_checkout").notNull().default(true),
    provider: text("provider"),
    providerPriceId: text("provider_price_id"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tierIntervalUnique: uniqueIndex("tier_prices_tier_interval_unique").on(
      table.tierId,
      table.interval,
    ),
    providerPriceUnique: uniqueIndex("tier_prices_provider_price_unique")
      .on(table.provider, table.providerPriceId)
      .where(sql`${table.providerPriceId} is not null`),
    amountPositive: check("tier_prices_amount_non_negative", sql`${table.amountCents} >= 0`),
  }),
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),
    subscriberId: uuid("subscriber_id").references(() => subscribers.id, {
      onDelete: "set null",
    }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    tierId: uuid("tier_id").references(() => subscriptionTiers.id, {
      onDelete: "restrict",
    }),
    tierPriceId: uuid("tier_price_id").references(() => tierPrices.id, {
      onDelete: "set null",
    }),
    source: subscriptionSourceEnum("source").notNull(),
    status: subscriptionStatusEnum("status").notNull(),
    provider: text("provider"),
    providerCustomerId: text("provider_customer_id"),
    providerSubscriptionId: text("provider_subscription_id"),
    currentPeriodStartsAt: timestamp("current_period_starts_at", { withTimezone: true }),
    currentPeriodEndsAt: timestamp("current_period_ends_at", { withTimezone: true }),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    gracePeriodEndsAt: timestamp("grace_period_ends_at", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    accessEndsAt: timestamp("access_ends_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    subscriberStatusIdx: index("subscriptions_subscriber_status_idx").on(
      table.subscriberId,
      table.status,
    ),
    providerSubscriptionUnique: uniqueIndex("subscriptions_provider_subscription_unique")
      .on(table.provider, table.providerSubscriptionId)
      .where(sql`${table.providerSubscriptionId} is not null`),
  }),
);

export const entitlementGrants = pgTable(
  "entitlement_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),
    subscriberId: uuid("subscriber_id").references(() => subscribers.id, {
      onDelete: "cascade",
    }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
      onDelete: "cascade",
    }),
    tierId: uuid("tier_id").references(() => subscriptionTiers.id, {
      onDelete: "cascade",
    }),
    entitlementKey: text("entitlement_key").notNull(),
    source: entitlementGrantSourceEnum("source").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    lookupIdx: index("entitlement_grants_lookup_idx").on(
      table.publicationId,
      table.entitlementKey,
      table.subscriberId,
      table.userId,
    ),
  }),
);

export const postMetadata = pgTable(
  "post_metadata",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    sourcePath: text("source_path").notNull(),
    sourceHash: text("source_hash").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull(),
    author: text("author").notNull(),
    status: postStatusEnum("status").notNull(),
    visibility: postVisibilityEnum("visibility").notNull(),
    canonicalUrl: text("canonical_url"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    mdxUpdatedAt: timestamp("mdx_updated_at", { withTimezone: true }),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    publicationSlugUnique: uniqueIndex("post_metadata_publication_slug_unique").on(
      table.publicationId,
      table.slug,
    ),
    sourcePathIdx: index("post_metadata_source_path_idx").on(table.sourcePath),
  }),
);

export const postAccessRules = pgTable(
  "post_access_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => postMetadata.id, { onDelete: "cascade" }),
    visibility: postVisibilityEnum("visibility").notNull(),
    requiresAuthentication: boolean("requires_authentication").notNull().default(false),
    requiresPaidSubscription: boolean("requires_paid_subscription").notNull().default(false),
    allowedTierIds: uuid("allowed_tier_ids").array().notNull().default(sql`'{}'::uuid[]`),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    postUnique: uniqueIndex("post_access_rules_post_unique").on(table.postId),
  }),
);

export const postOverlays = pgTable(
  "post_overlays",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => postMetadata.id, { onDelete: "cascade" }),
    overlayKey: text("overlay_key").notNull(),
    value: jsonb("value").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    postOverlayUnique: uniqueIndex("post_overlays_post_key_unique").on(
      table.postId,
      table.overlayKey,
    ),
  }),
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => postMetadata.id, { onDelete: "cascade" }),
    parentCommentId: uuid("parent_comment_id"),
    body: text("body").notNull(),
    authorKind: commentAuthorKindEnum("author_kind").notNull(),
    authorDisplayName: text("author_display_name").notNull(),
    authorEmail: text("author_email"),
    authorWebsite: text("author_website"),
    registeredUserId: uuid("registered_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    moderationStatus: moderationStatusEnum("moderation_status").notNull().default("suspicious"),
    requestContext: jsonb("request_context").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (table) => ({
    postStatusIdx: index("comments_post_status_idx").on(table.postId, table.moderationStatus),
    parentFk: foreignKey({
      columns: [table.parentCommentId],
      foreignColumns: [table.id],
      name: "comments_parent_comment_id_fk",
    }).onDelete("cascade"),
  }),
);

export const moderationAuditEntries = pgTable(
  "moderation_audit_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    commentId: uuid("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    outcome: text("outcome").notNull(),
    reason: text("reason"),
    score: numeric("score", { precision: 6, scale: 5 }),
    decision: jsonb("decision").$type<Record<string, unknown>>().notNull().default({}),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    commentIdx: index("moderation_audit_entries_comment_idx").on(table.commentId),
  }),
);

export const postReactions = pgTable(
  "post_reactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => postMetadata.id, { onDelete: "cascade" }),
    kind: reactionKindEnum("kind").notNull().default("like"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    subscriberId: uuid("subscriber_id").references(() => subscribers.id, {
      onDelete: "cascade",
    }),
    anonymousActorHash: text("anonymous_actor_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    actorRequired: check(
      "post_reactions_actor_required",
      sql`${table.userId} is not null or ${table.subscriberId} is not null or ${table.anonymousActorHash} is not null`,
    ),
    userUnique: uniqueIndex("post_reactions_user_unique")
      .on(table.postId, table.kind, table.userId)
      .where(sql`${table.userId} is not null`),
    subscriberUnique: uniqueIndex("post_reactions_subscriber_unique")
      .on(table.postId, table.kind, table.subscriberId)
      .where(sql`${table.subscriberId} is not null`),
    anonymousUnique: uniqueIndex("post_reactions_anonymous_unique")
      .on(table.postId, table.kind, table.anonymousActorHash)
      .where(sql`${table.anonymousActorHash} is not null`),
  }),
);

export const postShares = pgTable(
  "post_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => postMetadata.id, { onDelete: "cascade" }),
    channel: shareChannelEnum("channel").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    subscriberId: uuid("subscriber_id").references(() => subscribers.id, {
      onDelete: "set null",
    }),
    anonymousActorHash: text("anonymous_actor_hash"),
    requestContext: jsonb("request_context").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    postChannelIdx: index("post_shares_post_channel_idx").on(table.postId, table.channel),
  }),
);

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),
    kind: mediaAssetKindEnum("kind").notNull(),
    status: mediaAssetStatusEnum("status").notNull().default("pending"),
    provider: text("provider").notNull(),
    objectKey: text("object_key").notNull(),
    publicUrl: text("public_url"),
    mimeType: text("mime_type"),
    byteLength: bigint("byte_length", { mode: "number" }),
    checksumSha256: text("checksum_sha256"),
    durationSeconds: integer("duration_seconds"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    providerObjectUnique: uniqueIndex("media_assets_provider_object_unique").on(
      table.provider,
      table.objectKey,
    ),
  }),
);

export const podcastShows = pgTable(
  "podcast_shows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    status: podcastShowStatusEnum("status").notNull().default("draft"),
    language: text("language").notNull().default("en"),
    siteUrl: text("site_url").notNull(),
    feedUrl: text("feed_url"),
    coverImageAssetId: uuid("cover_image_asset_id").references(() => mediaAssets.id, {
      onDelete: "set null",
    }),
    authorName: text("author_name"),
    owner: jsonb("owner").$type<Record<string, unknown>>(),
    explicit: boolean("explicit").notNull().default(false),
    defaultAccessRule: jsonb("default_access_rule")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({ kind: "private_token" }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    publicationSlugUnique: uniqueIndex("podcast_shows_publication_slug_unique").on(
      table.publicationId,
      table.slug,
    ),
  }),
);

export const podcastEpisodes = pgTable(
  "podcast_episodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    showId: uuid("show_id")
      .notNull()
      .references(() => podcastShows.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    guid: text("guid").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    status: podcastEpisodeStatusEnum("status").notNull().default("draft"),
    visibility: podcastEpisodeVisibilityEnum("visibility").notNull().default("private"),
    accessRule: jsonb("access_rule").$type<Record<string, unknown>>(),
    mediaAssetId: uuid("media_asset_id").references(() => mediaAssets.id, {
      onDelete: "set null",
    }),
    enclosure: jsonb("enclosure").$type<Record<string, unknown>>().notNull().default({}),
    seasonNumber: integer("season_number"),
    episodeNumber: integer("episode_number"),
    explicit: boolean("explicit").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    showSlugUnique: uniqueIndex("podcast_episodes_show_slug_unique").on(
      table.showId,
      table.slug,
    ),
    guidUnique: uniqueIndex("podcast_episodes_guid_unique").on(table.guid),
  }),
);

export const privateFeedTokens = pgTable(
  "private_feed_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),
    showId: uuid("show_id").references(() => podcastShows.id, { onDelete: "cascade" }),
    subscriberId: uuid("subscriber_id").references(() => subscribers.id, {
      onDelete: "cascade",
    }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    status: privateFeedTokenStatusEnum("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    rotatedToTokenId: uuid("rotated_to_token_id"),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex("private_feed_tokens_token_hash_unique").on(table.tokenHash),
    subscriberIdx: index("private_feed_tokens_subscriber_idx").on(table.subscriberId),
    rotatedToFk: foreignKey({
      columns: [table.rotatedToTokenId],
      foreignColumns: [table.id],
      name: "private_feed_tokens_rotated_to_token_id_fk",
    }).onDelete("set null"),
  }),
);

export const privateFeedTokenAuditEvents = pgTable(
  "private_feed_token_audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenId: uuid("token_id")
      .notNull()
      .references(() => privateFeedTokens.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    showId: uuid("show_id").references(() => podcastShows.id, { onDelete: "set null" }),
    episodeId: uuid("episode_id").references(() => podcastEpisodes.id, {
      onDelete: "set null",
    }),
    allowed: boolean("allowed"),
    reason: text("reason"),
    requestContext: jsonb("request_context").$type<Record<string, unknown>>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenOccurredIdx: index("private_feed_token_audit_token_occurred_idx").on(
      table.tokenId,
      table.occurredAt,
    ),
  }),
);

export const webhookEventLogs = pgTable(
  "webhook_event_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    state: webhookLogStateEnum("state").notNull().default("received"),
    payloadHash: text("payload_hash"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastError: text("last_error"),
  },
  (table) => ({
    providerEventUnique: uniqueIndex("webhook_event_logs_provider_event_unique").on(
      table.provider,
      table.providerEventId,
    ),
    stateIdx: index("webhook_event_logs_state_idx").on(table.state),
  }),
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicationId: uuid("publication_id").references(() => publications.id, {
      onDelete: "set null",
    }),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id"),
    sensitivity: text("sensitivity").notNull().default("standard"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    requestContext: jsonb("request_context").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    subjectIdx: index("audit_logs_subject_idx").on(table.subjectType, table.subjectId),
    actorIdx: index("audit_logs_actor_idx").on(table.actorUserId),
  }),
);

export type Publication = typeof publications.$inferSelect;
export type User = typeof users.$inferSelect;
export type Subscriber = typeof subscribers.$inferSelect;
export type SubscriptionTier = typeof subscriptionTiers.$inferSelect;
export type TierPrice = typeof tierPrices.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type EntitlementGrant = typeof entitlementGrants.$inferSelect;
export type PostMetadata = typeof postMetadata.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type PodcastShow = typeof podcastShows.$inferSelect;
export type PodcastEpisode = typeof podcastEpisodes.$inferSelect;
