ALTER TYPE "public"."payment_status" ADD VALUE 'needs_review';--> statement-breakpoint
ALTER TABLE "monobank_events" ALTER COLUMN "order_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "monobank_events" ADD COLUMN "status" text;--> statement-breakpoint
ALTER TABLE "monobank_events" ADD COLUMN "amount" integer;--> statement-breakpoint
ALTER TABLE "monobank_events" ADD COLUMN "ccy" integer;--> statement-breakpoint
ALTER TABLE "monobank_events" ADD COLUMN "reference" text;--> statement-breakpoint
ALTER TABLE "monobank_events" ADD COLUMN "raw_payload" jsonb;--> statement-breakpoint
ALTER TABLE "monobank_events" ADD COLUMN "normalized_payload" jsonb;--> statement-breakpoint
ALTER TABLE "monobank_events" ADD COLUMN "applied_result" text;--> statement-breakpoint
ALTER TABLE "monobank_events" ADD COLUMN "applied_error_code" text;--> statement-breakpoint
ALTER TABLE "monobank_events" ADD COLUMN "applied_error_message" text;