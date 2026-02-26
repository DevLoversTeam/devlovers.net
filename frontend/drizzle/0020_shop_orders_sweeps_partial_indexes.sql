-- Minimal partial indexes for orders sweep selectors (plain CREATE INDEX).
-- NOTE: intentionally not using CONCURRENTLY in migration.

CREATE INDEX "orders_sweep_stripe_created_claim_id_idx"
ON "orders" ("created_at", "sweep_claim_expires_at", "id")
WHERE
  "payment_provider" = 'stripe'
  AND "payment_status" IN ('pending', 'requires_payment')
  AND "stock_restored" = false
  AND "restocked_at" IS NULL
  AND "inventory_status" <> 'released';
--> statement-breakpoint

CREATE INDEX "orders_sweep_none_created_claim_id_idx"
ON "orders" ("created_at", "sweep_claim_expires_at", "id")
WHERE
  "payment_provider" = 'none'
  AND "stock_restored" = false
  AND "restocked_at" IS NULL
  AND "inventory_status" IN ('none', 'reserving', 'release_pending');
--> statement-breakpoint