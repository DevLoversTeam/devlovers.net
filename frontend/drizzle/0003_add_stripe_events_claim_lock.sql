ALTER TABLE "stripe_events" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stripe_events" ADD COLUMN "claim_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stripe_events" ADD COLUMN "claimed_by" varchar(64);--> statement-breakpoint
CREATE INDEX "stripe_events_claim_expires_idx" ON "stripe_events" USING btree ("claim_expires_at");--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payment_attempts_provider_check'
  ) THEN
    ALTER TABLE "payment_attempts"
    ADD CONSTRAINT "payment_attempts_provider_check"
    CHECK ("provider" in ('stripe'));
  END IF;
END $$;--> statement-breakpoint
