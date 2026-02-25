import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/db';

type UpdatedRow = { order_id: string };

function readRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const anyRes = res as { rows?: unknown };
  if (Array.isArray(anyRes?.rows)) return anyRes.rows as T[];
  return [];
}

export async function anonymizeRetainedOrderShippingSnapshots(args: {
  runId: string;
  retentionDays: number;
  batchSize: number;
}): Promise<{ processed: number }> {
  const retentionDays = Math.max(1, Math.trunc(args.retentionDays));
  const batchSize = Math.max(1, Math.min(500, Math.trunc(args.batchSize)));
  const nowIso = new Date().toISOString();

  const res = await db.execute<UpdatedRow>(sql`
    with candidates as (
      select os.order_id
      from order_shipping os
      join orders o on o.id = os.order_id
      where o.shipping_status in ('delivered', 'cancelled')
        and o.updated_at <= now() - make_interval(days => ${retentionDays})
        and coalesce(lower(os.shipping_address ->> 'piiRedacted'), 'false') <> 'true'
      order by o.updated_at asc
      for update of os skip locked
      limit ${batchSize}
    ),
    updated as (
      update order_shipping os
      set shipping_address = jsonb_strip_nulls(
            jsonb_build_object(
              'piiRedacted', true,
              'redactedAt', ${nowIso}::text,
              'retentionPolicyDays', ${retentionDays}::int,
              'runId', ${args.runId}::uuid,
              'provider', coalesce(os.shipping_address ->> 'provider', 'nova_poshta'),
              'methodCode', os.shipping_address ->> 'methodCode',
              'selection', jsonb_build_object(
                'cityRef', os.shipping_address #>> '{selection,cityRef}',
                'warehouseRef', os.shipping_address #>> '{selection,warehouseRef}'
              ),
              'recipient', jsonb_build_object(
                'fullName', '[REDACTED]',
                'phone', '[REDACTED]',
                'email', '[REDACTED]'
              )
            )
          ),
          updated_at = now()
      where os.order_id in (select order_id from candidates)
      returning os.order_id
    )
    select order_id
    from updated
  `);

  return { processed: readRows<UpdatedRow>(res).length };
}
