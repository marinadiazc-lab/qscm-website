CREATE TYPE "public"."email_broadcast_status" AS ENUM('draft', 'scheduled', 'sending', 'sent', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."email_delivery_log_level" AS ENUM('info', 'warning', 'error');--> statement-breakpoint
CREATE TYPE "public"."email_send_intent_status" AS ENUM('pending', 'reserved', 'queued', 'sending', 'sent', 'failed', 'canceled', 'suppressed', 'skipped_duplicate');--> statement-breakpoint
CREATE TYPE "public"."email_send_kind" AS ENUM('transactional', 'broadcast');--> statement-breakpoint
CREATE TABLE "email_broadcasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"key" text,
	"status" "email_broadcast_status" DEFAULT 'draft' NOT NULL,
	"provider_broadcast_id" text,
	"subject" text NOT NULL,
	"preview_text" text,
	"html" text,
	"text" text,
	"target" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_delivery_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid,
	"intent_id" uuid,
	"broadcast_id" uuid,
	"subscriber_id" uuid,
	"recipient_email" text,
	"provider" text,
	"provider_message_id" text,
	"event_type" text NOT NULL,
	"level" "email_delivery_log_level" DEFAULT 'info' NOT NULL,
	"message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_provider_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"event_type" text NOT NULL,
	"provider_message_id" text,
	"recipient_email" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "email_send_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid NOT NULL,
	"kind" "email_send_kind" NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" "email_send_intent_status" DEFAULT 'pending' NOT NULL,
	"provider" text,
	"recipient_email" text,
	"subscriber_id" uuid,
	"broadcast_id" uuid,
	"provider_message_id" text,
	"provider_broadcast_id" text,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reserved_at" timestamp with time zone,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "email_broadcasts" ADD CONSTRAINT "email_broadcasts_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_delivery_logs" ADD CONSTRAINT "email_delivery_logs_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_delivery_logs" ADD CONSTRAINT "email_delivery_logs_intent_id_email_send_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."email_send_intents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_delivery_logs" ADD CONSTRAINT "email_delivery_logs_broadcast_id_email_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."email_broadcasts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_delivery_logs" ADD CONSTRAINT "email_delivery_logs_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_send_intents" ADD CONSTRAINT "email_send_intents_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_send_intents" ADD CONSTRAINT "email_send_intents_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_send_intents" ADD CONSTRAINT "email_send_intents_broadcast_id_email_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."email_broadcasts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_broadcasts_publication_key_unique" ON "email_broadcasts" USING btree ("publication_id","key") WHERE "email_broadcasts"."key" is not null;--> statement-breakpoint
CREATE INDEX "email_broadcasts_provider_broadcast_idx" ON "email_broadcasts" USING btree ("provider","provider_broadcast_id");--> statement-breakpoint
CREATE INDEX "email_broadcasts_status_idx" ON "email_broadcasts" USING btree ("publication_id","status");--> statement-breakpoint
CREATE INDEX "email_delivery_logs_intent_idx" ON "email_delivery_logs" USING btree ("intent_id");--> statement-breakpoint
CREATE INDEX "email_delivery_logs_subscriber_idx" ON "email_delivery_logs" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX "email_delivery_logs_provider_message_idx" ON "email_delivery_logs" USING btree ("provider","provider_message_id");--> statement-breakpoint
CREATE INDEX "email_delivery_logs_created_at_idx" ON "email_delivery_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "email_provider_events_provider_message_idx" ON "email_provider_events" USING btree ("provider","provider_message_id");--> statement-breakpoint
CREATE INDEX "email_provider_events_type_idx" ON "email_provider_events" USING btree ("provider","event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "email_send_intents_dedupe_unique" ON "email_send_intents" USING btree ("publication_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "email_send_intents_subscriber_idx" ON "email_send_intents" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX "email_send_intents_broadcast_idx" ON "email_send_intents" USING btree ("broadcast_id");--> statement-breakpoint
CREATE INDEX "email_send_intents_provider_message_idx" ON "email_send_intents" USING btree ("provider","provider_message_id");