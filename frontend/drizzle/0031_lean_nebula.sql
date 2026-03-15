update shipping_shipments s
set status = 'needs_attention',
    lease_owner = null,
    lease_expires_at = null,
    next_attempt_at = null,
    last_error_code = coalesce(s.last_error_code, 'ORDER_NOT_FULFILLABLE'),
    last_error_message = coalesce(
      s.last_error_message,
      'Shipping pipeline closed by DB backfill: order is not shippable.'
    ),
    updated_at = now()
from orders o
where o.id = s.order_id
  and s.status in ('queued', 'processing')
  and (
    o.shipping_required is not true
    or o.payment_status <> 'paid'
    or o.status <> 'PAID'
    or o.inventory_status <> 'reserved'
  );
--> statement-breakpoint

update orders o
set shipping_status = 'cancelled'::shipping_status,
    updated_at = now()
where (
    o.payment_status in ('failed', 'refunded')
    or o.status in ('CANCELED', 'INVENTORY_FAILED')
  )
  and o.shipping_status is not null
  and o.shipping_status not in ('cancelled'::shipping_status, 'delivered'::shipping_status);
--> statement-breakpoint

alter table "orders"
  add constraint "orders_terminal_shipping_status_chk"
  check (
    (
      "orders"."payment_status" not in ('failed', 'refunded')
      and "orders"."status" not in ('CANCELED', 'INVENTORY_FAILED')
    )
    or (
      "orders"."shipping_status" is null
      or "orders"."shipping_status" in ('cancelled', 'delivered')
    )
  )
  not valid;
--> statement-breakpoint

alter table "orders"
  validate constraint "orders_terminal_shipping_status_chk";
--> statement-breakpoint

create or replace function shop_orders_close_shipping_pipeline_guardrail()
returns trigger
language plpgsql
as $$
declare
  was_shippable boolean := false;
  is_shippable boolean := false;
  is_terminal boolean := false;
begin
  is_shippable := (
    new.shipping_required is true
    and new.payment_status = 'paid'
    and new.status = 'PAID'
    and new.inventory_status = 'reserved'
  );

  if tg_op = 'UPDATE' then
    was_shippable := (
      old.shipping_required is true
      and old.payment_status = 'paid'
      and old.status = 'PAID'
      and old.inventory_status = 'reserved'
    );
  end if;

  is_terminal := (
    new.payment_status in ('failed', 'refunded')
    or new.status in ('CANCELED', 'INVENTORY_FAILED')
  );

  if is_terminal or (was_shippable and not is_shippable) then
    if new.shipping_status is not null
       and new.shipping_status not in ('cancelled', 'delivered')
    then
      new.shipping_status := 'cancelled'::shipping_status;
    end if;

    update shipping_shipments s
    set status = 'needs_attention',
        lease_owner = null,
        lease_expires_at = null,
        next_attempt_at = null,
        last_error_code = coalesce(s.last_error_code, 'ORDER_NOT_FULFILLABLE'),
        last_error_message = coalesce(
          s.last_error_message,
          'Shipping pipeline closed by DB guardrail: order became non-shippable.'
        ),
        updated_at = now()
    where s.order_id = new.id
      and s.status in ('queued', 'processing');
  end if;

  return new;
end;
$$;
--> statement-breakpoint

drop trigger if exists trg_orders_close_shipping_pipeline_guardrail on orders;
--> statement-breakpoint

create trigger trg_orders_close_shipping_pipeline_guardrail
before update of payment_status, status, inventory_status, shipping_required
on orders
for each row
execute function shop_orders_close_shipping_pipeline_guardrail();
--> statement-breakpoint

create or replace function shop_shipping_shipments_require_shippable_order_guardrail()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('queued', 'processing') then
    if not exists (
      select 1
      from orders o
      where o.id = new.order_id
        and o.shipping_required is true
        and o.payment_status = 'paid'
        and o.status = 'PAID'
        and o.inventory_status = 'reserved'
    ) then
      raise exception
        using errcode = '23514',
              constraint = 'shipping_shipments_shippable_order_chk',
              message = 'shipping_shipments queued/processing rows require a shippable paid order';
    end if;
  end if;

  return new;
end;
$$;
--> statement-breakpoint

drop trigger if exists trg_shipping_shipments_require_shippable_order_guardrail on shipping_shipments;
--> statement-breakpoint

create trigger trg_shipping_shipments_require_shippable_order_guardrail
before insert or update of status, order_id
on shipping_shipments
for each row
execute function shop_shipping_shipments_require_shippable_order_guardrail();