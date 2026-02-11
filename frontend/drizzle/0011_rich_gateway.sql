ALTER TABLE "monobank_events" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "monobank_events" ADD COLUMN "claim_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "monobank_events" ADD COLUMN "claimed_by" text;--> statement-breakpoint
CREATE INDEX "monobank_events_claim_expires_idx" ON "monobank_events" USING btree ("claim_expires_at");