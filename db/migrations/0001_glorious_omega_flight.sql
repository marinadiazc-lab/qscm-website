ALTER TYPE "public"."auth_role" ADD VALUE 'editor' BEFORE 'admin';--> statement-breakpoint
ALTER TYPE "public"."auth_role" ADD VALUE 'moderator' BEFORE 'admin';--> statement-breakpoint
ALTER TYPE "public"."auth_role" ADD VALUE 'support' BEFORE 'admin';