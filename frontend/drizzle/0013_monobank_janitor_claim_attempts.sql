ALTER TABLE "payment_attempts"
ADD COLUMN IF NOT EXISTS "janitor_claimed_until" timestamp with time zone;

ALTER TABLE "payment_attempts"
ADD COLUMN IF NOT EXISTS "janitor_claimed_by" text;

CREATE INDEX IF NOT EXISTS "payment_attempts_janitor_claim_idx"
ON "payment_attempts" USING btree (
  "provider",
  "status",
  "janitor_claimed_until",
  "updated_at"
);
