import { type SQL, sql } from 'drizzle-orm';

import { shippingStatusTransitionWhereSql } from '@/lib/services/shop/transitions/shipping-state';

export function insertQueuedInitialShipmentSql(args: {
  orderIdColumn: SQL;
  eligibleOrders: SQL;
  now: Date;
  onConflict: 'keep-existing' | 'requeue';
}): SQL {
  const conflictAction =
    args.onConflict === 'requeue'
      ? sql`do update
          set status = 'queued',
              updated_at = ${args.now}
          where shipping_shipments.provider = 'nova_poshta'
            and shipping_shipments.status is distinct from 'queued'`
      : sql`do nothing`;

  return sql`
    insert into shipping_shipments (
      order_id,
      provider,
      status,
      attempt_count,
      created_at,
      updated_at
    )
    select
      ${args.orderIdColumn},
      'nova_poshta',
      'queued',
      0,
      ${args.now},
      ${args.now}
    from ${args.eligibleOrders}
    on conflict (order_id) ${conflictAction}
    returning order_id
  `;
}

export const shippingStatusCanBeQueuedSql = sql`
  shipping_status is distinct from 'queued'::shipping_status
  and ${shippingStatusTransitionWhereSql({
    column: sql`shipping_status`,
    to: 'queued',
    allowNullFrom: true,
  })}
`;
