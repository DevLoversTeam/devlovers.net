CREATE TABLE "api_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_rate_limits_count_non_negative" CHECK ("api_rate_limits"."count" >= 0)
);
--> statement-breakpoint
CREATE INDEX "api_rate_limits_updated_at_idx" ON "api_rate_limits" USING btree ("updated_at");--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payment_attempts_provider_check'
      AND conrelid = 'public.payment_attempts'::regclass
  ) THEN
    ALTER TABLE "payment_attempts"
      ADD CONSTRAINT "payment_attempts_provider_check"
      CHECK ("payment_attempts"."provider" in ('stripe'));
  END IF;
END $$;
