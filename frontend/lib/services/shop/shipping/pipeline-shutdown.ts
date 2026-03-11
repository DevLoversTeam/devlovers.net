import { sql } from 'drizzle-orm';

import { db } from '@/db';

function buildShutdownMessage(reason: string): string {
  const normalized = reason.trim();
  return normalized.length > 0
    ? `Shipping pipeline closed: ${normalized}`
    : 'Shipping pipeline closed.';
}

function readRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const maybe = res as { rows?: unknown };
  if (Array.isArray(maybe.rows)) return maybe.rows as T[];
  return [];
}

export async function closeShippingPipelineForOrder(args: {
  orderId: string;
  reason: string;
  now?: Date;
}): Promise<{ shipmentsClosed: number; orderClosed: boolean }> {
  const now = args.now ?? new Date();
  const reasonMessage = buildShutdownMessage(args.reason);

  const res = await db.execute<{
    shipments_closed: number;
    order_closed: boolean;
  }>(sql`
    with closed_shipments as (
      update shipping_shipments s
      set status = 'needs_attention',
          lease_owner = null,
          lease_expires_at = null,
          next_attempt_at = null,
          last_error_code = coalesce(s.last_error_code, 'ORDER_NOT_FULFILLABLE'),
          last_error_message = coalesce(s.last_error_message, ${reasonMessage}),
          updated_at = ${now}
      where s.order_id = ${args.orderId}::uuid
        and s.status in ('queued', 'processing', 'failed')
      returning s.id
    ),
    closed_order as (
      update orders o
      set shipping_status = 'cancelled'::shipping_status,
          updated_at = ${now}
      where o.id = ${args.orderId}::uuid
        and (
          o.shipping_required = true
          or exists (
            select 1
            from shipping_shipments s2
            where s2.order_id = o.id
          )
        )
        and (
          o.shipping_status is null
          or o.shipping_status not in ('delivered'::shipping_status, 'cancelled'::shipping_status)
        )
      returning o.id
    )
    select
      (select count(*)::int from closed_shipments) as shipments_closed,
      exists (select 1 from closed_order) as order_closed
  `);

  const row = readRows<{
    shipments_closed?: number;
    order_closed?: boolean;
  }>(res)[0];

  return {
    shipmentsClosed: Number(row?.shipments_closed ?? 0),
    orderClosed: Boolean(row?.order_closed),
  };
}
