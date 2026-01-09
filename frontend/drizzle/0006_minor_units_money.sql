-- 0006_minor_units_money.sql
-- Canonical money storage as integer minor units (cents).
-- Keeps legacy numeric(10,2) columns as mirrors for backward compatibility.

-- 1) product_prices
ALTER TABLE product_prices
  ADD COLUMN IF NOT EXISTS price_minor integer,
  ADD COLUMN IF NOT EXISTS original_price_minor integer;

UPDATE product_prices
SET price_minor = ROUND((price::numeric) * 100)::int
WHERE price_minor IS NULL;

UPDATE product_prices
SET original_price_minor = ROUND((original_price::numeric) * 100)::int
WHERE original_price_minor IS NULL AND original_price IS NOT NULL;

ALTER TABLE product_prices
  ALTER COLUMN price_minor SET NOT NULL;

-- Replace old checks to enforce canonical fields
ALTER TABLE product_prices DROP CONSTRAINT IF EXISTS product_prices_price_positive;
ALTER TABLE product_prices
  ADD CONSTRAINT product_prices_price_positive CHECK (price_minor > 0);

ALTER TABLE product_prices DROP CONSTRAINT IF EXISTS product_prices_original_price_valid;
ALTER TABLE product_prices
  ADD CONSTRAINT product_prices_original_price_valid
  CHECK (original_price_minor IS NULL OR original_price_minor >= price_minor);

-- 2) orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS total_amount_minor integer;

UPDATE orders
SET total_amount_minor = ROUND((total_amount::numeric) * 100)::int
WHERE total_amount_minor IS NULL;

ALTER TABLE orders
  ALTER COLUMN total_amount_minor SET NOT NULL;

-- 3) order_items
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS unit_price_minor integer,
  ADD COLUMN IF NOT EXISTS line_total_minor integer;

UPDATE order_items
SET unit_price_minor = ROUND((unit_price::numeric) * 100)::int
WHERE unit_price_minor IS NULL;

UPDATE order_items
SET line_total_minor = ROUND((line_total::numeric) * 100)::int
WHERE line_total_minor IS NULL;

ALTER TABLE order_items
  ALTER COLUMN unit_price_minor SET NOT NULL,
  ALTER COLUMN line_total_minor SET NOT NULL;
