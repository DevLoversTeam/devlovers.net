import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/db';
import { recordShippingMetric } from '@/lib/services/shop/shipping/metrics';

export type ShippingAdminAction =
  | 'retry_label_creation'
  | 'mark_shipped'
  | 'mark_delivered';

type ShippingStateRow = {
  order_id: string;
  shipping_required: boolean | null;
  shipping_provider: string | null;
  shipping_method_code: string | null;
  shipping_status: string | null;
  tracking_number: string | null;
  shipment_id: string | null;
  shipment_status: string | null;
};

type ResultRow = {
  id: string;
  shipping_status: string | null;
  tracking_number: string | null;
};

type ShipmentStatusRow = {
  status: string | null;
};

type ShippingAuditEntry = {
  action: ShippingAdminAction;
  actorUserId: string | null;
  requestId: string;
  fromShippingStatus: string | null;
  toShippingStatus: string | null;
  fromShipmentStatus: string | null;
  at: string;
};

export type ApplyShippingAdminActionResult = {
  orderId: string;
  shippingStatus: string | null;
  trackingNumber: string | null;
  shipmentStatus: string | null;
  changed: boolean;
  action: ShippingAdminAction;
};

export class ShippingAdminActionError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ShippingAdminActionError';
    this.code = code;
    this.status = status;
  }
}

function readRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const maybe = res as { rows?: unknown };
  if (Array.isArray(maybe.rows)) return maybe.rows as T[];
  return [];
}

function first<T>(res: unknown): T | null {
  return readRows<T>(res)[0] ?? null;
}

function assertOrderIsShippable(state: ShippingStateRow | null): asserts state is ShippingStateRow {
  if (!state) {
    throw new ShippingAdminActionError(
      'ORDER_NOT_FOUND',
      'Order not found.',
      404
    );
  }

  if (state.shipping_required !== true) {
    throw new ShippingAdminActionError(
      'SHIPPING_NOT_REQUIRED',
      'Order does not require shipping.',
      409
    );
  }

  if (state.shipping_provider !== 'nova_poshta') {
    throw new ShippingAdminActionError(
      'SHIPPING_PROVIDER_UNSUPPORTED',
      'Only Nova Poshta shipping is supported for this action.',
      409
    );
  }

  if (
    state.shipping_method_code !== 'NP_WAREHOUSE' &&
    state.shipping_method_code !== 'NP_LOCKER' &&
    state.shipping_method_code !== 'NP_COURIER'
  ) {
    throw new ShippingAdminActionError(
      'SHIPPING_METHOD_MISSING',
      'Shipping method is not set for this order.',
      409
    );
  }
}

async function loadShippingState(orderId: string): Promise<ShippingStateRow | null> {
  const res = await db.execute<ShippingStateRow>(sql`
    select
      o.id as order_id,
      o.shipping_required,
      o.shipping_provider,
      o.shipping_method_code,
      o.shipping_status,
      o.tracking_number,
      s.id as shipment_id,
      s.status as shipment_status
    from orders o
    left join shipping_shipments s on s.order_id = o.id
    where o.id = ${orderId}::uuid
    limit 1
  `);
  return first<ShippingStateRow>(res);
}

async function appendAuditEntry(args: {
  orderId: string;
  entry: ShippingAuditEntry;
}) {
  const entryJson = JSON.stringify([args.entry]);
  await db.execute(sql`
    update orders o
    set psp_metadata = jsonb_set(
      coalesce(o.psp_metadata, '{}'::jsonb),
      '{shippingAdminAudit}',
      coalesce(o.psp_metadata -> 'shippingAdminAudit', '[]'::jsonb) || ${entryJson}::jsonb,
      true
    ),
    updated_at = now()
    where o.id = ${args.orderId}::uuid
  `);
}

async function requeueShipment(args: {
  orderId: string;
  auditEntry: ShippingAuditEntry;
}): Promise<ResultRow | null> {
  const entryJson = JSON.stringify([args.auditEntry]);

  const res = await db.execute<ResultRow>(sql`
    with updated_shipment as (
      update shipping_shipments s
      set status = 'queued',
          next_attempt_at = now(),
          last_error_code = null,
          last_error_message = null,
          lease_owner = null,
          lease_expires_at = null,
          updated_at = now()
      where s.order_id = ${args.orderId}::uuid
        and s.status in ('failed', 'needs_attention')
      returning s.order_id
    ),
    updated_order as (
      update orders o
      set shipping_status = 'queued',
          psp_metadata = jsonb_set(
            coalesce(o.psp_metadata, '{}'::jsonb),
            '{shippingAdminAudit}',
            coalesce(o.psp_metadata -> 'shippingAdminAudit', '[]'::jsonb) || ${entryJson}::jsonb,
            true
          ),
          updated_at = now()
      where o.id in (select order_id from updated_shipment)
      returning o.id, o.shipping_status, o.tracking_number
    )
    select * from updated_order
  `);

  return first<ResultRow>(res);
}

async function updateOrderShippingStatus(args: {
  orderId: string;
  expectedStatus: 'label_created' | 'shipped';
  nextStatus: 'shipped' | 'delivered';
  auditEntry: ShippingAuditEntry;
}): Promise<ResultRow | null> {
  const entryJson = JSON.stringify([args.auditEntry]);
  const res = await db.execute<ResultRow>(sql`
    update orders o
    set shipping_status = ${args.nextStatus},
        psp_metadata = jsonb_set(
          coalesce(o.psp_metadata, '{}'::jsonb),
          '{shippingAdminAudit}',
          coalesce(o.psp_metadata -> 'shippingAdminAudit', '[]'::jsonb) || ${entryJson}::jsonb,
          true
        ),
        updated_at = now()
    where o.id = ${args.orderId}::uuid
      and o.shipping_status = ${args.expectedStatus}
    returning o.id, o.shipping_status, o.tracking_number
  `);
  return first<ResultRow>(res);
}

async function loadShipmentStatus(orderId: string): Promise<string | null> {
  const res = await db.execute<ShipmentStatusRow>(sql`
    select status
    from shipping_shipments
    where order_id = ${orderId}::uuid
    limit 1
  `);
  return first<ShipmentStatusRow>(res)?.status ?? null;
}

export async function applyShippingAdminAction(args: {
  orderId: string;
  action: ShippingAdminAction;
  actorUserId: string | null;
  requestId: string;
}): Promise<ApplyShippingAdminActionResult> {
  const state = await loadShippingState(args.orderId);
  assertOrderIsShippable(state);

  const nowIso = new Date().toISOString();

  if (args.action === 'retry_label_creation') {
    if (!state.shipment_id) {
      throw new ShippingAdminActionError(
        'SHIPMENT_NOT_FOUND',
        'Shipment record does not exist for this order.',
        409
      );
    }

    if (
      state.shipment_status !== 'failed' &&
      state.shipment_status !== 'needs_attention'
    ) {
      throw new ShippingAdminActionError(
        'RETRY_NOT_ALLOWED',
        'Retry is allowed only for failed or needs_attention shipments.',
        409
      );
    }

    const updated = await requeueShipment({
      orderId: args.orderId,
      auditEntry: {
        action: args.action,
        actorUserId: args.actorUserId,
        requestId: args.requestId,
        fromShippingStatus: state.shipping_status,
        toShippingStatus: 'queued',
        fromShipmentStatus: state.shipment_status,
        at: nowIso,
      },
    });

    if (!updated) {
      throw new ShippingAdminActionError(
        'RETRY_NOT_ALLOWED',
        'Shipment cannot be re-queued in current state.',
        409
      );
    }

    recordShippingMetric({
      name: 'queued',
      source: 'admin_action',
      orderId: updated.id,
      requestId: args.requestId,
    });

    return {
      orderId: updated.id,
      shippingStatus: updated.shipping_status,
      trackingNumber: updated.tracking_number,
      shipmentStatus: 'queued',
      changed: true,
      action: args.action,
    };
  }

  if (args.action === 'mark_shipped') {
    if (state.shipping_status === 'shipped') {
      await appendAuditEntry({
        orderId: args.orderId,
        entry: {
          action: args.action,
          actorUserId: args.actorUserId,
          requestId: args.requestId,
          fromShippingStatus: state.shipping_status,
          toShippingStatus: 'shipped',
          fromShipmentStatus: state.shipment_status,
          at: nowIso,
        },
      });

      return {
        orderId: state.order_id,
        shippingStatus: state.shipping_status,
        trackingNumber: state.tracking_number,
        shipmentStatus: state.shipment_status,
        changed: false,
        action: args.action,
      };
    }

    if (state.shipping_status !== 'label_created') {
      throw new ShippingAdminActionError(
        'INVALID_SHIPPING_TRANSITION',
        'mark_shipped is allowed only from label_created.',
        409
      );
    }

    const updated = await updateOrderShippingStatus({
      orderId: args.orderId,
      expectedStatus: 'label_created',
      nextStatus: 'shipped',
      auditEntry: {
        action: args.action,
        actorUserId: args.actorUserId,
        requestId: args.requestId,
        fromShippingStatus: state.shipping_status,
        toShippingStatus: 'shipped',
        fromShipmentStatus: state.shipment_status,
        at: nowIso,
      },
    });

    if (!updated) {
      throw new ShippingAdminActionError(
        'INVALID_SHIPPING_TRANSITION',
        'Unable to mark shipment as shipped.',
        409
      );
    }

    return {
      orderId: updated.id,
      shippingStatus: updated.shipping_status,
      trackingNumber: updated.tracking_number,
      shipmentStatus: await loadShipmentStatus(updated.id),
      changed: true,
      action: args.action,
    };
  }

  if (state.shipping_status === 'delivered') {
    await appendAuditEntry({
      orderId: args.orderId,
      entry: {
        action: args.action,
        actorUserId: args.actorUserId,
        requestId: args.requestId,
        fromShippingStatus: state.shipping_status,
        toShippingStatus: 'delivered',
        fromShipmentStatus: state.shipment_status,
        at: nowIso,
      },
    });

    return {
      orderId: state.order_id,
      shippingStatus: state.shipping_status,
      trackingNumber: state.tracking_number,
      shipmentStatus: state.shipment_status,
      changed: false,
      action: args.action,
    };
  }

  if (state.shipping_status !== 'shipped') {
    throw new ShippingAdminActionError(
      'INVALID_SHIPPING_TRANSITION',
      'mark_delivered is allowed only from shipped.',
      409
    );
  }

  const updated = await updateOrderShippingStatus({
    orderId: args.orderId,
    expectedStatus: 'shipped',
    nextStatus: 'delivered',
    auditEntry: {
      action: args.action,
      actorUserId: args.actorUserId,
      requestId: args.requestId,
      fromShippingStatus: state.shipping_status,
      toShippingStatus: 'delivered',
      fromShipmentStatus: state.shipment_status,
      at: nowIso,
    },
  });

  if (!updated) {
    throw new ShippingAdminActionError(
      'INVALID_SHIPPING_TRANSITION',
      'Unable to mark shipment as delivered.',
      409
    );
  }

  return {
    orderId: updated.id,
    shippingStatus: updated.shipping_status,
    trackingNumber: updated.tracking_number,
    shipmentStatus: await loadShipmentStatus(updated.id),
    changed: true,
    action: args.action,
  };
}
