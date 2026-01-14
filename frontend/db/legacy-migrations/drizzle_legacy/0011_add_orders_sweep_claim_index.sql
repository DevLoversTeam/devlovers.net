-- Minimal migration: add sweep claim columns + index
-- Safe to run when enums/inventory_moves already exist.

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "sweep_claimed_at" timestamp;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "sweep_claim_expires_at" timestamp;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "sweep_run_id" uuid;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "sweep_claimed_by" varchar(64);

CREATE INDEX IF NOT EXISTS "orders_sweep_claim_expires_idx"
  ON "orders" USING btree ("sweep_claim_expires_at");
