# Shop DB Index Rollout: Orders Sweep Partial Indexes

## Scope
- Migration adds two plain indexes:
  - `orders_sweep_stripe_created_claim_id_idx`
  - `orders_sweep_none_created_claim_id_idx`
- Migration path uses `CREATE INDEX` (non-concurrent) because Drizzle migration execution is transactional.

## Hard Safety Rules
- Do not run tests against production.
- Validate target database identity before applying anything.
- Run in a low-traffic window because plain `CREATE INDEX` can block writes on `orders`.

## Preflight (identity check via `psql`)
```sql
select
  current_database() as db_name,
  inet_server_addr() as server_addr,
  inet_server_port() as server_port,
  current_user as db_user;
```

Expected:
- `db_name` and `server_addr` match intended environment.
- If identity is wrong, stop immediately.

## Standard Migration Path (transactional, plain CREATE INDEX)
1. Announce maintenance window / low write traffic window.
2. Apply migration using normal Drizzle flow (`db:migrate`).
3. Verify indexes exist:
```sql
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'orders_sweep_stripe_created_claim_id_idx',
    'orders_sweep_none_created_claim_id_idx'
  );
```
4. Monitor API/job latency and lock waits for several minutes after rollout.

## Rollback
If index build causes unacceptable impact or must be reverted:
```sql
drop index if exists "orders_sweep_stripe_created_claim_id_idx";
drop index if exists "orders_sweep_none_created_claim_id_idx";
```

Then re-check:
```sql
select indexname
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'orders_sweep_stripe_created_claim_id_idx',
    'orders_sweep_none_created_claim_id_idx'
  );
```

## Operator-Only Optional Path: Manual CONCURRENTLY
Use only if your runner supports non-transactional execution. Do not run inside a transaction block.

```sql
create index concurrently if not exists "orders_sweep_stripe_created_claim_id_idx"
on "orders" ("created_at", "sweep_claim_expires_at", "id")
where
  "payment_provider" = 'stripe'
  and "payment_status" in ('pending', 'requires_payment')
  and "stock_restored" = false
  and "restocked_at" is null
  and "inventory_status" <> 'released';

create index concurrently if not exists "orders_sweep_none_created_claim_id_idx"
on "orders" ("created_at", "sweep_claim_expires_at", "id")
where
  "payment_provider" = 'none'
  and "stock_restored" = false
  and "restocked_at" is null
  and "inventory_status" in ('none', 'reserving', 'release_pending');
```

Note:
- `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block.
- If you use this operator path, coordinate migration state bookkeeping so environments remain consistent.
