CREATE TYPE "public"."auth_account_status" AS ENUM('active', 'disabled', 'unlinked');--> statement-breakpoint
CREATE TYPE "public"."auth_provider" AS ENUM('google', 'facebook', 'apple', 'email_magic_link');--> statement-breakpoint
CREATE TYPE "public"."auth_role" AS ENUM('reader', 'author', 'admin');--> statement-breakpoint
CREATE TYPE "public"."billing_interval" AS ENUM('month', 'year');--> statement-breakpoint
CREATE TYPE "public"."comment_author_kind" AS ENUM('anonymous', 'registered_user');--> statement-breakpoint
CREATE TYPE "public"."entitlement_grant_source" AS ENUM('subscription', 'gift', 'admin_comped', 'migration');--> statement-breakpoint
CREATE TYPE "public"."magic_link_request_status" AS ENUM('requested', 'consumed', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."media_asset_kind" AS ENUM('image', 'audio', 'video', 'document', 'other');--> statement-breakpoint
CREATE TYPE "public"."media_asset_status" AS ENUM('pending', 'ready', 'failed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."moderation_status" AS ENUM('approved', 'suspicious', 'blocked', 'removed');--> statement-breakpoint
CREATE TYPE "public"."podcast_episode_status" AS ENUM('draft', 'scheduled', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."podcast_episode_visibility" AS ENUM('public', 'private', 'unlisted');--> statement-breakpoint
CREATE TYPE "public"."podcast_show_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."post_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."post_visibility" AS ENUM('public', 'free_subscribers', 'paid_any', 'specific_tiers');--> statement-breakpoint
CREATE TYPE "public"."private_feed_token_status" AS ENUM('active', 'revoked', 'rotated', 'expired');--> statement-breakpoint
CREATE TYPE "public"."provider_sync_status" AS ENUM('pending', 'synced', 'failed', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."publication_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."reaction_kind" AS ENUM('like');--> statement-breakpoint
CREATE TYPE "public"."auth_session_status" AS ENUM('active', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."share_channel" AS ENUM('copy_link', 'email', 'facebook', 'linkedin', 'x', 'other');--> statement-breakpoint
CREATE TYPE "public"."subscriber_status" AS ENUM('active', 'unsubscribed', 'bounced', 'complained', 'suppressed');--> statement-breakpoint
CREATE TYPE "public"."subscription_source" AS ENUM('stripe', 'free', 'gift', 'admin_comped');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('free', 'trialing', 'active', 'past_due', 'grace_period', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused', 'expired', 'comped');--> statement-breakpoint
CREATE TYPE "public"."tier_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."auth_user_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."webhook_log_state" AS ENUM('received', 'processing', 'processed', 'ignored', 'failed');--> statement-breakpoint
CREATE TABLE "account_linking_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"provider" "auth_provider" NOT NULL,
	"provider_account_id" text NOT NULL,
	"email" text,
	"decision_outcome" text NOT NULL,
	"decision_reason" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text,
	"sensitivity" text DEFAULT 'standard' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "auth_provider" NOT NULL,
	"provider_account_id" text NOT NULL,
	"email" text,
	"email_verified_at" timestamp with time zone,
	"display_name" text,
	"avatar_url" text,
	"status" "auth_account_status" DEFAULT 'active' NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_authenticated_at" timestamp with time zone,
	"unlinked_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"status" "auth_session_status" DEFAULT 'active' NOT NULL,
	"request_context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"parent_comment_id" uuid,
	"body" text NOT NULL,
	"author_kind" "comment_author_kind" NOT NULL,
	"author_display_name" text NOT NULL,
	"author_email" text,
	"author_website" text,
	"registered_user_id" uuid,
	"moderation_status" "moderation_status" DEFAULT 'suspicious' NOT NULL,
	"request_context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "entitlement_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid NOT NULL,
	"subscriber_id" uuid,
	"user_id" uuid,
	"subscription_id" uuid,
	"tier_id" uuid,
	"entitlement_key" text NOT NULL,
	"source" "entitlement_grant_source" NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_link_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" "magic_link_request_status" DEFAULT 'requested' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"user_id" uuid,
	"session_id" uuid,
	"redirect_to" text,
	"request_context" jsonb
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid NOT NULL,
	"kind" "media_asset_kind" NOT NULL,
	"status" "media_asset_status" DEFAULT 'pending' NOT NULL,
	"provider" text NOT NULL,
	"object_key" text NOT NULL,
	"public_url" text,
	"mime_type" text,
	"byte_length" bigint,
	"checksum_sha256" text,
	"duration_seconds" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_audit_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comment_id" uuid NOT NULL,
	"source" text NOT NULL,
	"outcome" text NOT NULL,
	"reason" text,
	"score" numeric(6, 5),
	"decision" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "podcast_episodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"show_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"guid" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" "podcast_episode_status" DEFAULT 'draft' NOT NULL,
	"visibility" "podcast_episode_visibility" DEFAULT 'private' NOT NULL,
	"access_rule" jsonb,
	"media_asset_id" uuid,
	"enclosure" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"season_number" integer,
	"episode_number" integer,
	"explicit" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "podcast_shows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" "podcast_show_status" DEFAULT 'draft' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"site_url" text NOT NULL,
	"feed_url" text,
	"cover_image_asset_id" uuid,
	"author_name" text,
	"owner" jsonb,
	"explicit" boolean DEFAULT false NOT NULL,
	"default_access_rule" jsonb DEFAULT '{"kind":"private_token"}'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_access_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"visibility" "post_visibility" NOT NULL,
	"requires_authentication" boolean DEFAULT false NOT NULL,
	"requires_paid_subscription" boolean DEFAULT false NOT NULL,
	"allowed_tier_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"source_path" text NOT NULL,
	"source_hash" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text NOT NULL,
	"author" text NOT NULL,
	"status" "post_status" NOT NULL,
	"visibility" "post_visibility" NOT NULL,
	"canonical_url" text,
	"published_at" timestamp with time zone,
	"mdx_updated_at" timestamp with time zone,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_overlays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"overlay_key" text NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"kind" "reaction_kind" DEFAULT 'like' NOT NULL,
	"user_id" uuid,
	"subscriber_id" uuid,
	"anonymous_actor_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_reactions_actor_required" CHECK ("post_reactions"."user_id" is not null or "post_reactions"."subscriber_id" is not null or "post_reactions"."anonymous_actor_hash" is not null)
);
--> statement-breakpoint
CREATE TABLE "post_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"channel" "share_channel" NOT NULL,
	"user_id" uuid,
	"subscriber_id" uuid,
	"anonymous_actor_hash" text,
	"request_context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "private_feed_token_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"show_id" uuid,
	"episode_id" uuid,
	"allowed" boolean,
	"reason" text,
	"request_context" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "private_feed_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid NOT NULL,
	"show_id" uuid,
	"subscriber_id" uuid,
	"user_id" uuid,
	"token_hash" text NOT NULL,
	"status" "private_feed_token_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"rotated_at" timestamp with time zone,
	"rotated_to_token_id" uuid,
	"last_accessed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "publication_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriber_preferences" (
	"subscriber_id" uuid PRIMARY KEY NOT NULL,
	"marketing_email_opt_in" boolean DEFAULT true NOT NULL,
	"product_email_opt_in" boolean DEFAULT true NOT NULL,
	"comment_notification_opt_in" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriber_provider_syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_contact_id" text,
	"sync_status" "provider_sync_status" DEFAULT 'pending' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid NOT NULL,
	"user_id" uuid,
	"email" text NOT NULL,
	"status" "subscriber_status" DEFAULT 'active' NOT NULL,
	"source" text,
	"subscribed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unsubscribed_at" timestamp with time zone,
	"bounced_at" timestamp with time zone,
	"complained_at" timestamp with time zone,
	"suppressed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "tier_status" DEFAULT 'active' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"default_grace_period_days" integer DEFAULT 0 NOT NULL,
	"entitlement_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid NOT NULL,
	"subscriber_id" uuid,
	"user_id" uuid,
	"tier_id" uuid,
	"tier_price_id" uuid,
	"source" "subscription_source" NOT NULL,
	"status" "subscription_status" NOT NULL,
	"provider" text,
	"provider_customer_id" text,
	"provider_subscription_id" text,
	"current_period_starts_at" timestamp with time zone,
	"current_period_ends_at" timestamp with time zone,
	"trial_ends_at" timestamp with time zone,
	"grace_period_ends_at" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"canceled_at" timestamp with time zone,
	"access_ends_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tier_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tier_id" uuid NOT NULL,
	"interval" "billing_interval" NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"active_for_checkout" boolean DEFAULT true NOT NULL,
	"provider" text,
	"provider_price_id" text,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tier_prices_amount_non_negative" CHECK ("tier_prices"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role" "auth_role" NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by_user_id" uuid,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"display_name" text,
	"avatar_url" text,
	"status" "auth_user_status" DEFAULT 'active' NOT NULL,
	"disabled_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_event_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"state" "webhook_log_state" DEFAULT 'received' NOT NULL,
	"payload_hash" text,
	"payload" jsonb,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "account_linking_records" ADD CONSTRAINT "account_linking_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_post_metadata_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post_metadata"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_registered_user_id_users_id_fk" FOREIGN KEY ("registered_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_comment_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_grants" ADD CONSTRAINT "entitlement_grants_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_grants" ADD CONSTRAINT "entitlement_grants_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_grants" ADD CONSTRAINT "entitlement_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_grants" ADD CONSTRAINT "entitlement_grants_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_grants" ADD CONSTRAINT "entitlement_grants_tier_id_subscription_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."subscription_tiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_link_requests" ADD CONSTRAINT "magic_link_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_link_requests" ADD CONSTRAINT "magic_link_requests_session_id_auth_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."auth_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_audit_entries" ADD CONSTRAINT "moderation_audit_entries_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "podcast_episodes" ADD CONSTRAINT "podcast_episodes_show_id_podcast_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."podcast_shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "podcast_episodes" ADD CONSTRAINT "podcast_episodes_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "podcast_shows" ADD CONSTRAINT "podcast_shows_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "podcast_shows" ADD CONSTRAINT "podcast_shows_cover_image_asset_id_media_assets_id_fk" FOREIGN KEY ("cover_image_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_access_rules" ADD CONSTRAINT "post_access_rules_post_id_post_metadata_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post_metadata"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_metadata" ADD CONSTRAINT "post_metadata_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_overlays" ADD CONSTRAINT "post_overlays_post_id_post_metadata_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post_metadata"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_reactions" ADD CONSTRAINT "post_reactions_post_id_post_metadata_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post_metadata"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_reactions" ADD CONSTRAINT "post_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_reactions" ADD CONSTRAINT "post_reactions_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_shares" ADD CONSTRAINT "post_shares_post_id_post_metadata_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post_metadata"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_shares" ADD CONSTRAINT "post_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_shares" ADD CONSTRAINT "post_shares_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_feed_token_audit_events" ADD CONSTRAINT "private_feed_token_audit_events_token_id_private_feed_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."private_feed_tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_feed_token_audit_events" ADD CONSTRAINT "private_feed_token_audit_events_show_id_podcast_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."podcast_shows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_feed_token_audit_events" ADD CONSTRAINT "private_feed_token_audit_events_episode_id_podcast_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."podcast_episodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_feed_tokens" ADD CONSTRAINT "private_feed_tokens_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_feed_tokens" ADD CONSTRAINT "private_feed_tokens_show_id_podcast_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."podcast_shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_feed_tokens" ADD CONSTRAINT "private_feed_tokens_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_feed_tokens" ADD CONSTRAINT "private_feed_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_feed_tokens" ADD CONSTRAINT "private_feed_tokens_rotated_to_token_id_fk" FOREIGN KEY ("rotated_to_token_id") REFERENCES "public"."private_feed_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_preferences" ADD CONSTRAINT "subscriber_preferences_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_provider_syncs" ADD CONSTRAINT "subscriber_provider_syncs_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_tiers" ADD CONSTRAINT "subscription_tiers_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tier_id_subscription_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."subscription_tiers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tier_price_id_tier_prices_id_fk" FOREIGN KEY ("tier_price_id") REFERENCES "public"."tier_prices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tier_prices" ADD CONSTRAINT "tier_prices_tier_id_subscription_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."subscription_tiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_linking_records_provider_account_idx" ON "account_linking_records" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "audit_logs_subject_idx" ON "audit_logs" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_accounts_provider_account_unique" ON "auth_accounts" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "auth_accounts_user_id_idx" ON "auth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_token_hash_unique" ON "auth_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_status_idx" ON "auth_sessions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "comments_post_status_idx" ON "comments" USING btree ("post_id","moderation_status");--> statement-breakpoint
CREATE INDEX "entitlement_grants_lookup_idx" ON "entitlement_grants" USING btree ("publication_id","entitlement_key","subscriber_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "magic_link_requests_token_hash_unique" ON "magic_link_requests" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "magic_link_requests_email_status_idx" ON "magic_link_requests" USING btree (lower("email"),"status");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_provider_object_unique" ON "media_assets" USING btree ("provider","object_key");--> statement-breakpoint
CREATE INDEX "moderation_audit_entries_comment_idx" ON "moderation_audit_entries" USING btree ("comment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "podcast_episodes_show_slug_unique" ON "podcast_episodes" USING btree ("show_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "podcast_episodes_guid_unique" ON "podcast_episodes" USING btree ("guid");--> statement-breakpoint
CREATE UNIQUE INDEX "podcast_shows_publication_slug_unique" ON "podcast_shows" USING btree ("publication_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "post_access_rules_post_unique" ON "post_access_rules" USING btree ("post_id");--> statement-breakpoint
CREATE UNIQUE INDEX "post_metadata_publication_slug_unique" ON "post_metadata" USING btree ("publication_id","slug");--> statement-breakpoint
CREATE INDEX "post_metadata_source_path_idx" ON "post_metadata" USING btree ("source_path");--> statement-breakpoint
CREATE UNIQUE INDEX "post_overlays_post_key_unique" ON "post_overlays" USING btree ("post_id","overlay_key");--> statement-breakpoint
CREATE UNIQUE INDEX "post_reactions_user_unique" ON "post_reactions" USING btree ("post_id","kind","user_id") WHERE "post_reactions"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "post_reactions_subscriber_unique" ON "post_reactions" USING btree ("post_id","kind","subscriber_id") WHERE "post_reactions"."subscriber_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "post_reactions_anonymous_unique" ON "post_reactions" USING btree ("post_id","kind","anonymous_actor_hash") WHERE "post_reactions"."anonymous_actor_hash" is not null;--> statement-breakpoint
CREATE INDEX "post_shares_post_channel_idx" ON "post_shares" USING btree ("post_id","channel");--> statement-breakpoint
CREATE INDEX "private_feed_token_audit_token_occurred_idx" ON "private_feed_token_audit_events" USING btree ("token_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "private_feed_tokens_token_hash_unique" ON "private_feed_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "private_feed_tokens_subscriber_idx" ON "private_feed_tokens" USING btree ("subscriber_id");--> statement-breakpoint
CREATE UNIQUE INDEX "publications_slug_unique" ON "publications" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriber_provider_syncs_unique" ON "subscriber_provider_syncs" USING btree ("subscriber_id","provider");--> statement-breakpoint
CREATE INDEX "subscriber_provider_syncs_contact_idx" ON "subscriber_provider_syncs" USING btree ("provider","provider_contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscribers_publication_email_unique" ON "subscribers" USING btree ("publication_id",lower("email"));--> statement-breakpoint
CREATE INDEX "subscribers_user_id_idx" ON "subscribers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_tiers_publication_slug_unique" ON "subscription_tiers" USING btree ("publication_id","slug");--> statement-breakpoint
CREATE INDEX "subscriptions_subscriber_status_idx" ON "subscriptions" USING btree ("subscriber_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_provider_subscription_unique" ON "subscriptions" USING btree ("provider","provider_subscription_id") WHERE "subscriptions"."provider_subscription_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "tier_prices_tier_interval_unique" ON "tier_prices" USING btree ("tier_id","interval");--> statement-breakpoint
CREATE UNIQUE INDEX "tier_prices_provider_price_unique" ON "tier_prices" USING btree ("provider","provider_price_id") WHERE "tier_prices"."provider_price_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_event_logs_provider_event_unique" ON "webhook_event_logs" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "webhook_event_logs_state_idx" ON "webhook_event_logs" USING btree ("state");