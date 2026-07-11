CREATE TABLE "billing_customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid NOT NULL,
	"subscriber_id" uuid,
	"user_id" uuid,
	"provider" text NOT NULL,
	"provider_customer_id" text NOT NULL,
	"email" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "billing_customers_provider_customer_unique" ON "billing_customers" USING btree ("provider","provider_customer_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "billing_customers_user_provider_unique" ON "billing_customers" USING btree ("publication_id","user_id","provider") WHERE "billing_customers"."user_id" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX "billing_customers_subscriber_provider_unique" ON "billing_customers" USING btree ("publication_id","subscriber_id","provider") WHERE "billing_customers"."subscriber_id" is not null;
--> statement-breakpoint
ALTER TABLE "subscription_tiers" ADD COLUMN "provider" text;
--> statement-breakpoint
ALTER TABLE "subscription_tiers" ADD COLUMN "provider_product_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_tiers_provider_product_unique" ON "subscription_tiers" USING btree ("provider","provider_product_id") WHERE "subscription_tiers"."provider_product_id" is not null;
--> statement-breakpoint
DROP INDEX IF EXISTS "tier_prices_tier_interval_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "tier_prices_active_tier_interval_unique" ON "tier_prices" USING btree ("tier_id","interval") WHERE "tier_prices"."active_for_checkout" is true;
--> statement-breakpoint
CREATE UNIQUE INDEX "tier_prices_tier_interval_provider_unique" ON "tier_prices" USING btree ("tier_id","interval","provider_price_id");
