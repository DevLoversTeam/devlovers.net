-- P0-CUR / shipping invariants: enforce shipping core fields consistency on orders
-- Core fields: shipping_provider, shipping_method_code, shipping_status
-- Rule:
--   - if shipping_required is true  -> all core fields must be present
--   - if shipping_required is not true (false/null) -> all core fields must be null

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_shipping_null_when_not_required_chk"
  CHECK (
    "shipping_required" IS TRUE
    OR (
      "shipping_provider" IS NULL
      AND "shipping_method_code" IS NULL
      AND "shipping_status" IS NULL
    )
  ) NOT VALID;

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_shipping_present_when_required_chk"
  CHECK (
    "shipping_required" IS NOT TRUE
    OR (
      "shipping_provider" IS NOT NULL
      AND "shipping_method_code" IS NOT NULL
      AND "shipping_status" IS NOT NULL
    )
  ) NOT VALID;

ALTER TABLE "orders"
  VALIDATE CONSTRAINT "orders_shipping_null_when_not_required_chk";

ALTER TABLE "orders"
  VALIDATE CONSTRAINT "orders_shipping_present_when_required_chk";