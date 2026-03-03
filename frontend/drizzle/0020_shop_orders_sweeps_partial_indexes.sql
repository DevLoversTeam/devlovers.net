-- Minimal partial indexes for orders sweep selectors (plain CREATE INDEX).
-- NOTE: intentionally not using CONCURRENTLY in migration.
-- DEPLOYMENT PLAN: run during low-traffic / maintenance window because plain CREATE INDEX takes locks.
-- FAIL-FAST: set short lock_timeout so we don't block writes if the lock can't be acquired quickly.
-- If zero-downtime is required, CREATE INDEX CONCURRENTLY must be executed outside a transaction (separate ops/runbook).
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '5min';

CREATE INDEX "orders_sweep_stripe_created_claim_id_idx"
ON "orders" ("created_at", "sweep_claim_expires_at", "id")
WHERE
  "payment_provider" = 'stripe'
  AND "payment_status" IN ('pending', 'requires_payment')
  AND "stock_restored" = false
  AND "restocked_at" IS NULL
  AND "inventory_status" <> 'released';
--> statement-breakpoint

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '5min';

CREATE INDEX "orders_sweep_none_created_claim_id_idx"
ON "orders" ("created_at", "sweep_claim_expires_at", "id")
WHERE
  "payment_provider" = 'none'
  AND "stock_restored" = false
  AND "restocked_at" IS NULL
  AND "inventory_status" IN ('none', 'reserving', 'release_pending');
--> statement-breakpoint
