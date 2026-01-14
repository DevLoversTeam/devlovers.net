-- p0_inventory_workflow_baseline
-- Idempotent baseline for order status + inventory workflow + minor-units invariants.

-- 0) Enums (idempotent)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type order_status as enum ('CREATED','INVENTORY_RESERVED','INVENTORY_FAILED','PAID','CANCELED');
  end if;

  if not exists (select 1 from pg_type where typname = 'inventory_status') then
    create type inventory_status as enum ('none','reserving','reserved','release_pending','released','failed');
  end if;

  if not exists (select 1 from pg_type where typname = 'inventory_move_type') then
    create type inventory_move_type as enum ('reserve','release');
  end if;
end $$;

-- 1) inventory_moves table + indexes (idempotent)
create table if not exists inventory_moves (
  id uuid primary key default gen_random_uuid(),
  move_key varchar(200) not null,
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id),
  type inventory_move_type not null,
  quantity integer not null,
  created_at timestamptz not null default now(),
  constraint inventory_moves_quantity_gt_0 check (quantity > 0)
);

create unique index if not exists inventory_moves_move_key_uq on inventory_moves(move_key);
create index if not exists inventory_moves_order_id_idx on inventory_moves(order_id);
create index if not exists inventory_moves_product_id_idx on inventory_moves(product_id);

-- 2) orders: add workflow columns if missing (idempotent)
alter table orders
  add column if not exists status order_status not null default 'CREATED',
  add column if not exists inventory_status inventory_status not null default 'none',
  add column if not exists failure_code text,
  add column if not exists failure_message text,
  add column if not exists idempotency_request_hash text,
  add column if not exists stock_restored boolean not null default false,
  add column if not exists restocked_at timestamp;

-- 3) order_items: add minor columns, backfill, enforce not null (idempotent)
alter table order_items
  add column if not exists unit_price_minor integer,
  add column if not exists line_total_minor integer;

update order_items
set
  unit_price_minor = coalesce(unit_price_minor, round((unit_price::numeric) * 100)::int),
  line_total_minor = coalesce(line_total_minor, round((line_total::numeric) * 100)::int)
where unit_price_minor is null
   or line_total_minor is null;

alter table order_items
  alter column unit_price_minor set not null,
  alter column line_total_minor set not null;

-- 4) Unique index for order_items upsert (idempotent)
create unique index if not exists order_items_order_product_uq
  on order_items(order_id, product_id);

-- 5) Data hygiene before CHECK constraints (safe idempotent)
-- Normalize unknown payment_provider values (matches your resolvePaymentProvider fallback intent)
update orders
set payment_provider = case
  when payment_provider in ('stripe','none') then payment_provider
  when payment_intent_id is not null then 'stripe'
  when payment_status = 'paid' then 'none'
  else 'stripe'
end,
updated_at = now()
where payment_provider not in ('stripe','none');

-- Ensure provider=none has null PSP fields + payment_intent_id
update orders
set
  payment_intent_id = null,
  psp_charge_id = null,
  psp_payment_method = null,
  psp_status_reason = null,
  updated_at = now()
where payment_provider = 'none';

-- Fix invalid statuses for provider=none before CHECK
update orders
set payment_status = 'paid',
    updated_at = now()
where payment_provider = 'none'
  and payment_status not in ('paid','failed');

-- 6) CHECK constraints (idempotent via pg_constraint)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_payment_provider_valid') then
    alter table orders
      add constraint orders_payment_provider_valid
      check (payment_provider in ('stripe','none'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'orders_total_amount_minor_non_negative') then
    alter table orders
      add constraint orders_total_amount_minor_non_negative
      check (total_amount_minor >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'orders_total_amount_mirror_consistent') then
    alter table orders
      add constraint orders_total_amount_mirror_consistent
      check (total_amount = (total_amount_minor::numeric / 100));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'orders_payment_intent_id_null_when_none') then
    alter table orders
      add constraint orders_payment_intent_id_null_when_none
      check (payment_provider <> 'none' or payment_intent_id is null);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'orders_psp_fields_null_when_none') then
    alter table orders
      add constraint orders_psp_fields_null_when_none
      check (
        payment_provider <> 'none'
        or (
          psp_charge_id is null
          and psp_payment_method is null
          and psp_status_reason is null
        )
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'orders_payment_status_valid_when_none') then
    alter table orders
      add constraint orders_payment_status_valid_when_none
      check (payment_provider <> 'none' or payment_status in ('paid','failed'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'order_items_quantity_positive') then
    alter table order_items
      add constraint order_items_quantity_positive
      check (quantity > 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'order_items_unit_price_minor_non_negative') then
    alter table order_items
      add constraint order_items_unit_price_minor_non_negative
      check (unit_price_minor >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'order_items_line_total_minor_non_negative') then
    alter table order_items
      add constraint order_items_line_total_minor_non_negative
      check (line_total_minor >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'order_items_line_total_consistent') then
    alter table order_items
      add constraint order_items_line_total_consistent
      check (line_total_minor = unit_price_minor * quantity);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'order_items_unit_price_mirror_consistent') then
    alter table order_items
      add constraint order_items_unit_price_mirror_consistent
      check (unit_price = (unit_price_minor::numeric / 100));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'order_items_line_total_mirror_consistent') then
    alter table order_items
      add constraint order_items_line_total_mirror_consistent
      check (line_total = (line_total_minor::numeric / 100));
  end if;
end $$;
