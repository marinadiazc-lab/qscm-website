CREATE TABLE "engagement_rate_limit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"post_slug" text,
	"anonymous_actor_hash" text,
	"ip_hash" text,
	"email_hash" text,
	"registered_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "engagement_rate_limit_events" ADD CONSTRAINT "engagement_rate_limit_events_registered_user_id_users_id_fk" FOREIGN KEY ("registered_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "engagement_rate_limit_events_action_created_idx" ON "engagement_rate_limit_events" USING btree ("action","created_at");
--> statement-breakpoint
CREATE INDEX "engagement_rate_limit_events_post_action_idx" ON "engagement_rate_limit_events" USING btree ("post_slug","action");
--> statement-breakpoint
CREATE INDEX "engagement_rate_limit_events_actor_idx" ON "engagement_rate_limit_events" USING btree ("anonymous_actor_hash");
--> statement-breakpoint
CREATE INDEX "engagement_rate_limit_events_ip_idx" ON "engagement_rate_limit_events" USING btree ("ip_hash");
--> statement-breakpoint
CREATE INDEX "engagement_rate_limit_events_email_idx" ON "engagement_rate_limit_events" USING btree ("email_hash");
--> statement-breakpoint
CREATE INDEX "engagement_rate_limit_events_user_idx" ON "engagement_rate_limit_events" USING btree ("registered_user_id");
