ALTER TABLE "users" ADD COLUMN "provider" text DEFAULT 'credentials' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "provider_id" text;