-- 0019_p2_shop_invariants.sql

-- Prefix LIKE optimization
CREATE INDEX "np_cities_active_name_prefix_idx"
ON "np_cities" USING btree ("is_active", "name_ua" text_pattern_ops);
--> statement-breakpoint

-- New shipping invariants (add as NOT VALID to reduce locking)
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_shipping_amount_minor_non_negative_chk"
  CHECK ("orders"."shipping_amount_minor" IS NULL OR "orders"."shipping_amount_minor" >= 0)
  NOT VALID;
--> statement-breakpoint

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_shipping_payer_null_when_not_required_chk"
  CHECK ("orders"."shipping_required" IS TRUE OR "orders"."shipping_payer" IS NULL)
  NOT VALID;
--> statement-breakpoint

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_shipping_payer_present_when_required_chk"
  CHECK ("orders"."shipping_required" IS DISTINCT FROM TRUE OR "orders"."shipping_payer" IS NOT NULL)
  NOT VALID;
--> statement-breakpoint

ALTER TABLE "shipping_shipments"
  ADD CONSTRAINT "shipping_shipments_attempt_count_non_negative_chk"
  CHECK ("shipping_shipments"."attempt_count" >= 0)
  NOT VALID;
--> statement-breakpoint

-- Validate constraints (will scan but not block writes like full ADD without NOT VALID)
ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_shipping_amount_minor_non_negative_chk";
--> statement-breakpoint
ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_shipping_payer_null_when_not_required_chk";
--> statement-breakpoint
ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_shipping_payer_present_when_required_chk";
--> statement-breakpoint
ALTER TABLE "shipping_shipments" VALIDATE CONSTRAINT "shipping_shipments_attempt_count_non_negative_chk";