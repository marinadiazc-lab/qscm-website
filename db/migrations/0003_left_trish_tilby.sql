CREATE TYPE "public"."media_asset_access" AS ENUM('public', 'admin', 'entitled');--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "stable_path" text;--> statement-breakpoint
UPDATE "media_assets" SET "stable_path" = COALESCE("public_url", '/' || "object_key") WHERE "stable_path" IS NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ALTER COLUMN "stable_path" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "access" "media_asset_access" DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "original_file_name" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "alt_text" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "width" integer;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "height" integer;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "last_referenced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_stable_path_unique" ON "media_assets" USING btree ("stable_path");--> statement-breakpoint
CREATE INDEX "media_assets_publication_access_idx" ON "media_assets" USING btree ("publication_id","access","status");
