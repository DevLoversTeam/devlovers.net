# Monobank B3 Verification (Read-Only)

This script verifies Monobank data invariants without modifying data. It is safe
to run in DEV/UAT/PROD.

## What it checks

- All **checkout-eligible** products have a UAH price row (currency = `UAH`)
  with a non-negative minor price.
- Required indexes exist on `payment_attempts`:
  - `payment_attempts_order_provider_active_unique`
  - `payment_attempts_provider_status_updated_idx`

Checkout-eligible predicate is derived from shop code:

- `products.is_active = true` (see `frontend/db/queries/shop/products.ts` and
  `frontend/lib/services/orders/checkout.ts`).

## Run (PowerShell)

```powershell
cd frontend
$env:DATABASE_URL="postgres://USER:PASSWORD@HOST:PORT/DB"
npx tsx .\scripts\verify-monobank-b3.ts
```

### Environment examples

```powershell
# DEV
$env:DATABASE_URL="postgres://dev_user:dev_pass@dev-host:5432/dev_db"
npx tsx .\scripts\verify-monobank-b3.ts

# UAT
$env:DATABASE_URL="postgres://uat_user:uat_pass@uat-host:5432/uat_db"
npx tsx .\scripts\verify-monobank-b3.ts

# PROD
$env:DATABASE_URL="postgres://prod_user:prod_pass@prod-host:5432/prod_db"
npx tsx .\scripts\verify-monobank-b3.ts
```

The script exits with code `1` if any requirement fails.

## SQL snippets (manual verification)

```sql
-- Missing/invalid UAH prices for active products
SELECT p.id, p.slug, p.title
FROM products p
LEFT JOIN product_prices pp
  ON pp.product_id = p.id AND pp.currency = 'UAH'
WHERE p.is_active = true
  AND (pp.price_minor IS NULL OR pp.price_minor < 0);

-- Required indexes on payment_attempts
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'payment_attempts'
  AND indexname IN (
    'payment_attempts_order_provider_active_unique',
    'payment_attempts_provider_status_updated_idx'
  );
```
