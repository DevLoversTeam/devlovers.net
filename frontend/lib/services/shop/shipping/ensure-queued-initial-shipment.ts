import 'server-only';

import { type SQL, sql } from 'drizzle-orm';

import { db } from '@/db';
import { orderShippingEligibilityWhereSql } from '@/lib/services/shop/shipping/eligibility';
import { shippingStatusTransitionWhereSql } from '@/lib/services/shop/transitions/shipping-state';

type SupportedPaymentProvider = 'monobank' | 'stripe';

type CountRow = {
  inserted_shipment_count?: number;
  queued_shipment_count?: number;
  updated_order_count?: number;
};

export type EnsureQueuedInitialShipmentResult = {
  insertedShipment: boolean;
  queuedShipment: boolean;
  updatedOrder: boolean;
};

function readRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const maybe = res as { rows?: unknown };
  if (Array.isArray(maybe.rows)) return maybe.rows as T[];
  return [];
}

function paymentProviderFilterSql(
  paymentProvider: SupportedPaymentProvider | null | undefined
): SQL {
  return paymentProvider
    ? sql`and o.payment_provider = ${paymentProvider}`
    : sql``;
}

export async function ensureQueuedInitialShipment(args: {
  now: Date;
  orderId: string;
  paymentProvider?: SupportedPaymentProvider | null;
}): Promise<EnsureQueuedInitialShipmentResult> {
  const res = await db.execute<CountRow>(sql`
    with eligible_order as (
      select o.id
      from orders o
      where o.id = ${args.orderId}::uuid
        ${paymentProviderFilterSql(args.paymentProvider)}
        and o.shipping_required = true
        and o.shipping_provider = 'nova_poshta'
        and o.shipping_method_code is not null
        and ${orderShippingEligibilityWhereSql({
          paymentStatusColumn: sql`o.payment_status`,
          orderStatusColumn: sql`o.status`,
          inventoryStatusColumn: sql`o.inventory_status`,
          pspStatusReasonColumn: sql`o.psp_status_reason`,
        })}
    ),
    inserted_shipment as (
      insert into shipping_shipments (
        order_id,
        provider,
        status,
        attempt_count,
        created_at,
        updated_at
      )
      select
        eo.id,
        'nova_poshta',
        'queued',
        0,
        ${args.now},
        ${args.now}
      from eligible_order eo
      on conflict (order_id) do nothing
      returning order_id
    ),
    queued_order_ids as (
      select order_id from inserted_shipment
      union
      select s.order_id
      from shipping_shipments s
      where s.order_id in (select id from eligible_order)
        and s.provider = 'nova_poshta'
        and s.status = 'queued'
    ),
    updated_order as (
      update orders
      set shipping_status = 'queued'::shipping_status,
          updated_at = ${args.now}
      where id in (select order_id from queued_order_ids)
        and shipping_status is distinct from 'queued'::shipping_status
        and ${shippingStatusTransitionWhereSql({
          column: sql`shipping_status`,
          to: 'queued',
          allowNullFrom: true,
        })}
      returning id
    )
    select
      (select count(*)::int from inserted_shipment) as inserted_shipment_count,
      (select count(*)::int from queued_order_ids) as queued_shipment_count,
      (select count(*)::int from updated_order) as updated_order_count
  `);

  const row = readRows<CountRow>(res)[0];

  return {
    insertedShipment: Number(row?.inserted_shipment_count ?? 0) > 0,
    queuedShipment: Number(row?.queued_shipment_count ?? 0) > 0,
    updatedOrder: Number(row?.updated_order_count ?? 0) > 0,
  };
}
