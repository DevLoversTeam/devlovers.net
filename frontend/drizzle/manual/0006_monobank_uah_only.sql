-- 0006_monobank_uah_only.sql
-- Minimal DB support for Monobank payment attempts.
-- IMPORTANT: does NOT change global currency model (USD remains supported).

-- 1) Expand allowed payment providers on orders
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_payment_provider_valid;

ALTER TABLE orders
  ADD CONSTRAINT orders_payment_provider_valid
  CHECK (payment_provider IN ('stripe','monobank','none'));

-- 2) payment_attempts: add columns needed by Monobank (nullable for legacy rows)
ALTER TABLE payment_attempts
  ADD COLUMN IF NOT EXISTS currency currency;

ALTER TABLE payment_attempts
  ADD COLUMN IF NOT EXISTS expected_amount_minor bigint;

-- 3) Expand allowed providers on payment_attempts
ALTER TABLE payment_attempts
  DROP CONSTRAINT IF EXISTS payment_attempts_provider_check;

ALTER TABLE payment_attempts
  ADD CONSTRAINT payment_attempts_provider_check
  CHECK (provider IN ('stripe','monobank'));

-- 4) Expand allowed statuses (add creating)
ALTER TABLE payment_attempts
  DROP CONSTRAINT IF EXISTS payment_attempts_status_check;

ALTER TABLE payment_attempts
  ADD CONSTRAINT payment_attempts_status_check
  CHECK (status IN ('creating','active','succeeded','failed','canceled'));

-- 5) Money invariants for expected_amount_minor
ALTER TABLE payment_attempts
  DROP CONSTRAINT IF EXISTS payment_attempts_expected_amount_minor_non_negative;

ALTER TABLE payment_attempts
  ADD CONSTRAINT payment_attempts_expected_amount_minor_non_negative
  CHECK (expected_amount_minor IS NULL OR expected_amount_minor >= 0);

-- 6) Monobank-only invariant: currency must be UAH
ALTER TABLE payment_attempts
  DROP CONSTRAINT IF EXISTS payment_attempts_mono_currency_uah;

ALTER TABLE payment_attempts
  ADD CONSTRAINT payment_attempts_mono_currency_uah
  CHECK (provider <> 'monobank' OR currency = 'UAH');

-- 7) At most one active/creating attempt per (order, provider)
DROP INDEX IF EXISTS payment_attempts_order_provider_active_unique;

CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_order_provider_active_unique
  ON payment_attempts(order_id, provider)
  WHERE status IN ('active','creating');
