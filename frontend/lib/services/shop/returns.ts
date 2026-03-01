import 'server-only';

import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/db';
import { orderItems, orders, returnItems, returnRequests } from '@/db/schema';
import { createRefund } from '@/lib/psp/stripe';
import { InvalidPayloadError } from '@/lib/services/errors';
import { buildAdminAuditDedupeKey } from '@/lib/services/shop/events/dedupe-key';
import { buildShippingEventDedupeKey } from '@/lib/services/shop/events/dedupe-key';
import {
  isReturnStatusTransitionAllowed,
  type ReturnStatus,
} from '@/lib/services/shop/transitions/return-state';

type ReturnRequestRow = {
  id: string;
  orderId: string;
  userId: string | null;
  status: ReturnStatus;
  reason: string | null;
  policyRestock: boolean;
  refundAmountMinor: number;
  currency: 'USD' | 'UAH';
  idempotencyKey: string;
  approvedAt: Date | null;
  approvedBy: string | null;
  rejectedAt: Date | null;
  rejectedBy: string | null;
  receivedAt: Date | null;
  receivedBy: string | null;
  refundedAt: Date | null;
  refundedBy: string | null;
  refundProviderRef: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ReturnItemRow = {
  id: string;
  returnRequestId: string;
  orderId: string;
  orderItemId: string | null;
  productId: string | null;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  currency: 'USD' | 'UAH';
  idempotencyKey: string;
  createdAt: Date;
};

type OrderForReturnRow = {
  id: string;
  userId: string | null;
  paymentProvider: string;
  paymentStatus: string;
  paymentIntentId: string | null;
  pspChargeId: string | null;
  currency: 'USD' | 'UAH';
  totalAmountMinor: number;
};

export type ReturnRequestWithItems = ReturnRequestRow & {
  items: ReturnItemRow[];
};

function readRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const maybe = res as { rows?: unknown };
  if (Array.isArray(maybe.rows)) return maybe.rows as T[];
  return [];
}

function returnError(
  code:
    | 'RETURN_NOT_FOUND'
    | 'RETURN_ALREADY_EXISTS'
    | 'RETURN_ORDER_ITEMS_EMPTY'
    | 'RETURN_TRANSITION_INVALID'
    | 'RETURN_REFUND_STATE_INVALID'
    | 'RETURN_REFUND_PROVIDER_UNSUPPORTED'
    | 'RETURN_REFUND_PAYMENT_STATUS_INVALID'
    | 'RETURN_REFUND_MISSING_PSP_TARGET'
    | 'RETURN_REFUND_AMOUNT_INVALID'
    | 'RETURN_RESTOCK_NO_RESERVE'
    | 'RETURN_ITEMS_MISSING',
  message: string,
  details?: Record<string, unknown>
): InvalidPayloadError {
  return new InvalidPayloadError(message, { code, details });
}

function buildReturnShippingDedupe(args: {
  returnRequestId: string;
  orderId: string;
  action: string;
  requestId: string;
  statusFrom: string | null;
  statusTo: string;
}) {
  return buildShippingEventDedupeKey({
    domain: 'returns',
    returnRequestId: args.returnRequestId,
    orderId: args.orderId,
    action: args.action,
    requestId: args.requestId,
    statusFrom: args.statusFrom,
    statusTo: args.statusTo,
  });
}

function buildReturnAdminAuditDedupe(args: {
  returnRequestId: string;
  orderId: string;
  action: string;
  requestId: string;
  actorUserId: string | null;
  statusFrom: string | null;
  statusTo: string;
}) {
  return buildAdminAuditDedupeKey({
    domain: 'returns',
    returnRequestId: args.returnRequestId,
    orderId: args.orderId,
    action: args.action,
    requestId: args.requestId,
    actorUserId: args.actorUserId,
    statusFrom: args.statusFrom,
    statusTo: args.statusTo,
  });
}

async function loadOrder(orderId: string): Promise<OrderForReturnRow | null> {
  const [row] = await db
    .select({
      id: orders.id,
      userId: orders.userId,
      paymentProvider: orders.paymentProvider,
      paymentStatus: orders.paymentStatus,
      paymentIntentId: orders.paymentIntentId,
      pspChargeId: orders.pspChargeId,
      currency: orders.currency,
      totalAmountMinor: orders.totalAmountMinor,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId ?? null,
    paymentProvider: String(row.paymentProvider),
    paymentStatus: String(row.paymentStatus),
    paymentIntentId: row.paymentIntentId ?? null,
    pspChargeId: row.pspChargeId ?? null,
    currency: row.currency as 'USD' | 'UAH',
    totalAmountMinor: Number(row.totalAmountMinor ?? 0),
  };
}

async function loadReturnById(
  returnRequestId: string
): Promise<ReturnRequestRow | null> {
  const [row] = await db
    .select({
      id: returnRequests.id,
      orderId: returnRequests.orderId,
      userId: returnRequests.userId,
      status: returnRequests.status,
      reason: returnRequests.reason,
      policyRestock: returnRequests.policyRestock,
      refundAmountMinor: returnRequests.refundAmountMinor,
      currency: returnRequests.currency,
      idempotencyKey: returnRequests.idempotencyKey,
      approvedAt: returnRequests.approvedAt,
      approvedBy: returnRequests.approvedBy,
      rejectedAt: returnRequests.rejectedAt,
      rejectedBy: returnRequests.rejectedBy,
      receivedAt: returnRequests.receivedAt,
      receivedBy: returnRequests.receivedBy,
      refundedAt: returnRequests.refundedAt,
      refundedBy: returnRequests.refundedBy,
      refundProviderRef: returnRequests.refundProviderRef,
      createdAt: returnRequests.createdAt,
      updatedAt: returnRequests.updatedAt,
    })
    .from(returnRequests)
    .where(eq(returnRequests.id, returnRequestId))
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    orderId: row.orderId,
    userId: row.userId ?? null,
    status: row.status as ReturnStatus,
    reason: row.reason ?? null,
    policyRestock: !!row.policyRestock,
    refundAmountMinor: Number(row.refundAmountMinor ?? 0),
    currency: row.currency as 'USD' | 'UAH',
    idempotencyKey: row.idempotencyKey,
    approvedAt: row.approvedAt ?? null,
    approvedBy: row.approvedBy ?? null,
    rejectedAt: row.rejectedAt ?? null,
    rejectedBy: row.rejectedBy ?? null,
    receivedAt: row.receivedAt ?? null,
    receivedBy: row.receivedBy ?? null,
    refundedAt: row.refundedAt ?? null,
    refundedBy: row.refundedBy ?? null,
    refundProviderRef: row.refundProviderRef ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function loadReturnItemsByRequestId(
  returnRequestId: string
): Promise<ReturnItemRow[]> {
  const rows = await db
    .select({
      id: returnItems.id,
      returnRequestId: returnItems.returnRequestId,
      orderId: returnItems.orderId,
      orderItemId: returnItems.orderItemId,
      productId: returnItems.productId,
      quantity: returnItems.quantity,
      unitPriceMinor: returnItems.unitPriceMinor,
      lineTotalMinor: returnItems.lineTotalMinor,
      currency: returnItems.currency,
      idempotencyKey: returnItems.idempotencyKey,
      createdAt: returnItems.createdAt,
    })
    .from(returnItems)
    .where(eq(returnItems.returnRequestId, returnRequestId))
    .orderBy(asc(returnItems.createdAt), asc(returnItems.id));

  return rows.map(row => ({
    id: row.id,
    returnRequestId: row.returnRequestId,
    orderId: row.orderId,
    orderItemId: row.orderItemId ?? null,
    productId: row.productId ?? null,
    quantity: Number(row.quantity),
    unitPriceMinor: Number(row.unitPriceMinor),
    lineTotalMinor: Number(row.lineTotalMinor),
    currency: row.currency as 'USD' | 'UAH',
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt,
  }));
}

async function loadReturnByIdWithItems(
  returnRequestId: string
): Promise<ReturnRequestWithItems | null> {
  const request = await loadReturnById(returnRequestId);
  if (!request) return null;
  const items = await loadReturnItemsByRequestId(returnRequestId);
  return { ...request, items };
}

async function applyReturnRestockMove(args: {
  returnRequestId: string;
  orderId: string;
  productId: string;
  quantity: number;
}): Promise<
  'applied' | 'already' | 'already_released' | 'no_reserve' | 'noop'
> {
  const moveKey = `return_release:${args.returnRequestId}:${args.productId}`;
  const res = await db.execute<{ status: string }>(sql`
    with c as (
      select
        ${args.orderId}::uuid as order_id,
        ${args.productId}::uuid as product_id,
        ${args.quantity}::int as qty,
        ${moveKey}::varchar as move_key
    ),
    has_reserve as (
      select 1
      from inventory_moves m, c
      where m.order_id = c.order_id
        and m.product_id = c.product_id
        and m.type = 'reserve'
      limit 1
    ),
    already_released as (
      select 1
      from inventory_moves m, c
      where m.order_id = c.order_id
        and m.product_id = c.product_id
        and m.type = 'release'
      limit 1
    ),
    claimed as (
      insert into inventory_moves (move_key, order_id, product_id, type, quantity)
      select c.move_key, c.order_id, c.product_id, 'release', c.qty
      from c
      where exists (select 1 from has_reserve)
        and not exists (select 1 from already_released)
      on conflict (move_key) do nothing
      returning 1
    ),
    upd as (
      update products p
      set stock = p.stock + c.qty,
          updated_at = now()
      from c
      where p.id = c.product_id
        and exists (select 1 from claimed)
      returning 1
    )
    select case
      when exists (select 1 from upd) then 'applied'
      when exists (select 1 from inventory_moves m where m.move_key = (select move_key from c)) then 'already'
      when exists (select 1 from already_released) then 'already_released'
      when not exists (select 1 from has_reserve) then 'no_reserve'
      else 'noop'
    end as status
  `);

  const status = readRows<{ status: string }>(res)[0]?.status;
  if (
    status === 'applied' ||
    status === 'already' ||
    status === 'already_released' ||
    status === 'no_reserve' ||
    status === 'noop'
  ) {
    return status;
  }

  return 'noop';
}

async function restockReturnItems(returnRequestId: string, orderId: string) {
  const grouped = await db.execute<{
    product_id: string;
    quantity: number;
  }>(sql`
    select
      ri.product_id::text as product_id,
      sum(ri.quantity)::int as quantity
    from return_items ri
    where ri.return_request_id = ${returnRequestId}::uuid
      and ri.order_id = ${orderId}::uuid
      and ri.product_id is not null
    group by ri.product_id
  `);
  const productsToRelease = readRows<{ product_id: string; quantity: number }>(
    grouped
  );
  if (productsToRelease.length === 0) {
    throw returnError(
      'RETURN_ITEMS_MISSING',
      'Return request has no restockable items.'
    );
  }

  for (const item of productsToRelease) {
    const status = await applyReturnRestockMove({
      returnRequestId,
      orderId,
      productId: item.product_id,
      quantity: Number(item.quantity),
    });
    if (status === 'no_reserve') {
      throw returnError(
        'RETURN_RESTOCK_NO_RESERVE',
        'Cannot restock return without an existing reserve inventory move.',
        { returnRequestId, orderId, productId: item.product_id }
      );
    }
  }
}

export async function createReturnRequest(args: {
  orderId: string;
  actorUserId: string;
  idempotencyKey: string;
  reason?: string | null;
  policyRestock?: boolean;
  requestId: string;
}): Promise<{ created: boolean; request: ReturnRequestWithItems }> {
  const order = await loadOrder(args.orderId);
  if (!order) {
    throw returnError('RETURN_NOT_FOUND', 'Order not found.');
  }

  const items = await db
    .select({
      id: orderItems.id,
      productId: orderItems.productId,
      quantity: orderItems.quantity,
      unitPriceMinor: orderItems.unitPriceMinor,
      lineTotalMinor: orderItems.lineTotalMinor,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, args.orderId));

  if (items.length === 0) {
    throw returnError(
      'RETURN_ORDER_ITEMS_EMPTY',
      'Cannot create return request for an order with no items.'
    );
  }

  const refundAmountMinor = items.reduce(
    (sum, row) => sum + Number(row.lineTotalMinor ?? 0),
    0
  );
  const now = new Date();
  const eventDedupeKey = buildReturnShippingDedupe({
    returnRequestId: args.idempotencyKey,
    orderId: args.orderId,
    action: 'create',
    requestId: args.requestId,
    statusFrom: null,
    statusTo: 'requested',
  });
  const auditDedupeKey = buildReturnAdminAuditDedupe({
    returnRequestId: args.idempotencyKey,
    orderId: args.orderId,
    action: 'return.requested',
    requestId: args.requestId,
    actorUserId: args.actorUserId,
    statusFrom: null,
    statusTo: 'requested',
  });

  const insertRes = await db.execute<{ return_request_id: string }>(sql`
    with inserted_request as (
      insert into return_requests (
        order_id,
        user_id,
        status,
        reason,
        policy_restock,
        refund_amount_minor,
        currency,
        idempotency_key,
        created_at,
        updated_at
      )
      values (
        ${args.orderId}::uuid,
        ${args.actorUserId},
        'requested',
        ${args.reason ?? null},
        ${args.policyRestock ?? true},
        ${refundAmountMinor},
        ${order.currency},
        ${args.idempotencyKey},
        ${now},
        ${now}
      )
      on conflict (idempotency_key) do nothing
      returning id, order_id, refund_amount_minor, currency
    ),
    inserted_items as (
      insert into return_items (
        return_request_id,
        order_id,
        order_item_id,
        product_id,
        quantity,
        unit_price_minor,
        line_total_minor,
        currency,
        idempotency_key,
        created_at
      )
      select
        ir.id,
        oi.order_id,
        oi.id,
        oi.product_id,
        oi.quantity,
        oi.unit_price_minor,
        oi.line_total_minor,
        ir.currency,
        ('return_item:' || ir.id::text || ':' || oi.id::text),
        ${now}
      from inserted_request ir
      join order_items oi
        on oi.order_id = ir.order_id
      on conflict (idempotency_key) do nothing
      returning id
    ),
    inserted_event as (
      insert into shipping_events (
        order_id,
        shipment_id,
        provider,
        event_name,
        event_source,
        event_ref,
        status_from,
        status_to,
        tracking_number,
        payload,
        dedupe_key,
        occurred_at,
        created_at
      )
      select
        ir.order_id,
        null,
        'returns',
        'return_requested',
        'returns_customer_route',
        ${args.requestId},
        null,
        'requested',
        null,
        ${JSON.stringify({
          actorUserId: args.actorUserId,
          idempotencyKey: args.idempotencyKey,
          refundAmountMinor,
          currency: order.currency,
        })}::jsonb,
        ${eventDedupeKey},
        ${now},
        ${now}
      from inserted_request ir
      on conflict (dedupe_key) do nothing
      returning id
    ),
    inserted_audit as (
      insert into admin_audit_log (
        order_id,
        actor_user_id,
        action,
        target_type,
        target_id,
        request_id,
        payload,
        dedupe_key,
        occurred_at,
        created_at
      )
      select
        ir.order_id,
        ${args.actorUserId},
        'return.requested',
        'return_request',
        ir.id::text,
        ${args.requestId},
        ${JSON.stringify({
          actorUserId: args.actorUserId,
          idempotencyKey: args.idempotencyKey,
          refundAmountMinor,
          currency: order.currency,
        })}::jsonb,
        ${auditDedupeKey},
        ${now},
        ${now}
      from inserted_request ir
      on conflict (dedupe_key) do nothing
      returning id
    )
    select ir.id::text as return_request_id
    from inserted_request ir
  `);

  const insertedReturnId = readRows<{ return_request_id: string }>(insertRes)[0]
    ?.return_request_id;

  if (insertedReturnId) {
    const created = await loadReturnByIdWithItems(insertedReturnId);
    if (!created) {
      throw returnError(
        'RETURN_NOT_FOUND',
        'Return request not found after create.'
      );
    }
    return { created: true, request: created };
  }

  const [existingByIdempotency] = await db
    .select({ id: returnRequests.id })
    .from(returnRequests)
    .where(eq(returnRequests.idempotencyKey, args.idempotencyKey))
    .limit(1);

  if (existingByIdempotency) {
    const existing = await loadReturnByIdWithItems(existingByIdempotency.id);
    if (!existing) {
      throw returnError('RETURN_NOT_FOUND', 'Return request not found.');
    }
    return { created: false, request: existing };
  }

  const [existingOrderReturn] = await db
    .select({ id: returnRequests.id })
    .from(returnRequests)
    .where(eq(returnRequests.orderId, args.orderId))
    .limit(1);

  if (existingOrderReturn) {
    throw returnError(
      'RETURN_ALREADY_EXISTS',
      'A return request already exists for this order.',
      { returnRequestId: existingOrderReturn.id }
    );
  }

  throw returnError('RETURN_NOT_FOUND', 'Unable to create return request.');
}

export async function listOrderReturns(
  orderId: string
): Promise<ReturnRequestWithItems[]> {
  const requests = await db
    .select({
      id: returnRequests.id,
      orderId: returnRequests.orderId,
      userId: returnRequests.userId,
      status: returnRequests.status,
      reason: returnRequests.reason,
      policyRestock: returnRequests.policyRestock,
      refundAmountMinor: returnRequests.refundAmountMinor,
      currency: returnRequests.currency,
      idempotencyKey: returnRequests.idempotencyKey,
      approvedAt: returnRequests.approvedAt,
      approvedBy: returnRequests.approvedBy,
      rejectedAt: returnRequests.rejectedAt,
      rejectedBy: returnRequests.rejectedBy,
      receivedAt: returnRequests.receivedAt,
      receivedBy: returnRequests.receivedBy,
      refundedAt: returnRequests.refundedAt,
      refundedBy: returnRequests.refundedBy,
      refundProviderRef: returnRequests.refundProviderRef,
      createdAt: returnRequests.createdAt,
      updatedAt: returnRequests.updatedAt,
    })
    .from(returnRequests)
    .where(eq(returnRequests.orderId, orderId))
    .orderBy(asc(returnRequests.createdAt), asc(returnRequests.id));

  if (requests.length === 0) return [];
  const returnRequestIds = requests.map(row => row.id);
  const allItems = await db
    .select({
      id: returnItems.id,
      returnRequestId: returnItems.returnRequestId,
      orderId: returnItems.orderId,
      orderItemId: returnItems.orderItemId,
      productId: returnItems.productId,
      quantity: returnItems.quantity,
      unitPriceMinor: returnItems.unitPriceMinor,
      lineTotalMinor: returnItems.lineTotalMinor,
      currency: returnItems.currency,
      idempotencyKey: returnItems.idempotencyKey,
      createdAt: returnItems.createdAt,
    })
    .from(returnItems)
    .where(inArray(returnItems.returnRequestId, returnRequestIds))
    .orderBy(asc(returnItems.createdAt), asc(returnItems.id));

  const itemsByRequest = new Map<string, ReturnItemRow[]>();
  for (const row of allItems) {
    const mapped: ReturnItemRow = {
      id: row.id,
      returnRequestId: row.returnRequestId,
      orderId: row.orderId,
      orderItemId: row.orderItemId ?? null,
      productId: row.productId ?? null,
      quantity: Number(row.quantity),
      unitPriceMinor: Number(row.unitPriceMinor),
      lineTotalMinor: Number(row.lineTotalMinor),
      currency: row.currency as 'USD' | 'UAH',
      idempotencyKey: row.idempotencyKey,
      createdAt: row.createdAt,
    };
    const list = itemsByRequest.get(mapped.returnRequestId);
    if (list) list.push(mapped);
    else itemsByRequest.set(mapped.returnRequestId, [mapped]);
  }

  return requests.map(row => ({
    id: row.id,
    orderId: row.orderId,
    userId: row.userId ?? null,
    status: row.status as ReturnStatus,
    reason: row.reason ?? null,
    policyRestock: !!row.policyRestock,
    refundAmountMinor: Number(row.refundAmountMinor ?? 0),
    currency: row.currency as 'USD' | 'UAH',
    idempotencyKey: row.idempotencyKey,
    approvedAt: row.approvedAt ?? null,
    approvedBy: row.approvedBy ?? null,
    rejectedAt: row.rejectedAt ?? null,
    rejectedBy: row.rejectedBy ?? null,
    receivedAt: row.receivedAt ?? null,
    receivedBy: row.receivedBy ?? null,
    refundedAt: row.refundedAt ?? null,
    refundedBy: row.refundedBy ?? null,
    refundProviderRef: row.refundProviderRef ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: itemsByRequest.get(row.id) ?? [],
  }));
}

async function applyTransition(args: {
  returnRequestId: string;
  actorUserId: string | null;
  requestId: string;
  expectedFrom: ReturnStatus;
  statusTo: ReturnStatus;
  action: string;
  eventName: string;
  setClause: ReturnType<typeof sql>;
  payload: Record<string, unknown>;
}): Promise<{ changed: boolean; row: ReturnRequestRow }> {
  const current = await loadReturnById(args.returnRequestId);
  if (!current) {
    throw returnError('RETURN_NOT_FOUND', 'Return request not found.');
  }
  if (current.status === args.statusTo) {
    return { changed: false, row: current };
  }
  if (!isReturnStatusTransitionAllowed(current.status, args.statusTo)) {
    throw returnError(
      'RETURN_TRANSITION_INVALID',
      `Invalid return transition from ${current.status} to ${args.statusTo}.`,
      {
        returnRequestId: current.id,
        statusFrom: current.status,
        statusTo: args.statusTo,
      }
    );
  }
  if (current.status !== args.expectedFrom) {
    throw returnError(
      'RETURN_TRANSITION_INVALID',
      `Invalid return transition from ${current.status} to ${args.statusTo}.`,
      {
        returnRequestId: current.id,
        statusFrom: current.status,
        statusTo: args.statusTo,
      }
    );
  }

  const now = new Date();
  const eventDedupeKey = buildReturnShippingDedupe({
    returnRequestId: current.id,
    orderId: current.orderId,
    action: args.action,
    requestId: args.requestId,
    statusFrom: current.status,
    statusTo: args.statusTo,
  });
  const auditDedupeKey = buildReturnAdminAuditDedupe({
    returnRequestId: current.id,
    orderId: current.orderId,
    action: args.action,
    requestId: args.requestId,
    actorUserId: args.actorUserId,
    statusFrom: current.status,
    statusTo: args.statusTo,
  });

  const result = await db.execute<{ id: string }>(sql`
    with updated_request as (
      update return_requests r
      set status = ${args.statusTo},
          ${args.setClause},
          updated_at = ${now}
      where r.id = ${current.id}::uuid
        and r.status = ${args.expectedFrom}
      returning r.id, r.order_id
    ),
    inserted_event as (
      insert into shipping_events (
        order_id,
        shipment_id,
        provider,
        event_name,
        event_source,
        event_ref,
        status_from,
        status_to,
        tracking_number,
        payload,
        dedupe_key,
        occurred_at,
        created_at
      )
      select
        ur.order_id,
        null,
        'returns',
        ${args.eventName},
        'returns_admin_route',
        ${args.requestId},
        ${args.expectedFrom},
        ${args.statusTo},
        null,
        ${JSON.stringify(args.payload)}::jsonb,
        ${eventDedupeKey},
        ${now},
        ${now}
      from updated_request ur
      on conflict (dedupe_key) do nothing
      returning id
    ),
    inserted_audit as (
      insert into admin_audit_log (
        order_id,
        actor_user_id,
        action,
        target_type,
        target_id,
        request_id,
        payload,
        dedupe_key,
        occurred_at,
        created_at
      )
      select
        ur.order_id,
        ${args.actorUserId},
        ${args.action},
        'return_request',
        ur.id::text,
        ${args.requestId},
        ${JSON.stringify(args.payload)}::jsonb,
        ${auditDedupeKey},
        ${now},
        ${now}
      from updated_request ur
      on conflict (dedupe_key) do nothing
      returning id
    )
    select ur.id::text as id
    from updated_request ur
  `);

  if (readRows<{ id: string }>(result).length === 0) {
    const latest = await loadReturnById(args.returnRequestId);
    if (!latest) {
      throw returnError('RETURN_NOT_FOUND', 'Return request not found.');
    }
    if (latest.status === args.statusTo) {
      return { changed: false, row: latest };
    }
    throw returnError(
      'RETURN_TRANSITION_INVALID',
      `Invalid return transition from ${latest.status} to ${args.statusTo}.`,
      {
        returnRequestId: latest.id,
        statusFrom: latest.status,
        statusTo: args.statusTo,
      }
    );
  }

  const updated = await loadReturnById(args.returnRequestId);
  if (!updated) {
    throw returnError('RETURN_NOT_FOUND', 'Return request not found.');
  }
  return { changed: true, row: updated };
}

export async function approveReturnRequest(args: {
  returnRequestId: string;
  actorUserId: string | null;
  requestId: string;
}) {
  return applyTransition({
    returnRequestId: args.returnRequestId,
    actorUserId: args.actorUserId,
    requestId: args.requestId,
    expectedFrom: 'requested',
    statusTo: 'approved',
    action: 'return.approve',
    eventName: 'return_approved',
    setClause: sql`approved_at = ${new Date()}, approved_by = ${args.actorUserId}`,
    payload: {
      returnRequestId: args.returnRequestId,
      actorUserId: args.actorUserId,
    },
  });
}

export async function rejectReturnRequest(args: {
  returnRequestId: string;
  actorUserId: string | null;
  requestId: string;
}) {
  return applyTransition({
    returnRequestId: args.returnRequestId,
    actorUserId: args.actorUserId,
    requestId: args.requestId,
    expectedFrom: 'requested',
    statusTo: 'rejected',
    action: 'return.reject',
    eventName: 'return_rejected',
    setClause: sql`rejected_at = ${new Date()}, rejected_by = ${args.actorUserId}`,
    payload: {
      returnRequestId: args.returnRequestId,
      actorUserId: args.actorUserId,
    },
  });
}

export async function receiveReturnRequest(args: {
  returnRequestId: string;
  actorUserId: string | null;
  requestId: string;
}) {
  const current = await loadReturnById(args.returnRequestId);
  if (!current) {
    throw returnError('RETURN_NOT_FOUND', 'Return request not found.');
  }
  if (current.status === 'received') {
    return { changed: false, row: current };
  }
  if (!isReturnStatusTransitionAllowed(current.status, 'received')) {
    throw returnError(
      'RETURN_TRANSITION_INVALID',
      `Invalid return transition from ${current.status} to received.`,
      {
        returnRequestId: current.id,
        statusFrom: current.status,
        statusTo: 'received',
      }
    );
  }

  if (current.policyRestock) {
    await restockReturnItems(current.id, current.orderId);
  }

  return applyTransition({
    returnRequestId: args.returnRequestId,
    actorUserId: args.actorUserId,
    requestId: args.requestId,
    expectedFrom: 'approved',
    statusTo: 'received',
    action: 'return.receive',
    eventName: 'return_received',
    setClause: sql`received_at = ${new Date()}, received_by = ${args.actorUserId}`,
    payload: {
      returnRequestId: args.returnRequestId,
      actorUserId: args.actorUserId,
      restocked: current.policyRestock,
    },
  });
}

export async function refundReturnRequest(args: {
  returnRequestId: string;
  actorUserId: string | null;
  requestId: string;
}) {
  const current = await loadReturnById(args.returnRequestId);
  if (!current) {
    throw returnError('RETURN_NOT_FOUND', 'Return request not found.');
  }
  if (current.status === 'refunded') {
    return { changed: false, row: current };
  }
  if (!isReturnStatusTransitionAllowed(current.status, 'refunded')) {
    throw returnError(
      'RETURN_REFUND_STATE_INVALID',
      'Refund is allowed only after return is received.',
      { returnRequestId: current.id, status: current.status }
    );
  }
  if (
    !Number.isInteger(current.refundAmountMinor) ||
    current.refundAmountMinor <= 0
  ) {
    throw returnError(
      'RETURN_REFUND_AMOUNT_INVALID',
      'Refund amount is invalid.',
      {
        returnRequestId: current.id,
        refundAmountMinor: current.refundAmountMinor,
      }
    );
  }

  const order = await loadOrder(current.orderId);
  if (!order) {
    throw returnError(
      'RETURN_NOT_FOUND',
      'Order not found for return request.'
    );
  }

  if (order.paymentProvider !== 'stripe') {
    throw returnError(
      'RETURN_REFUND_PROVIDER_UNSUPPORTED',
      'Return refund is supported only for Stripe orders.'
    );
  }
  if (order.paymentStatus !== 'paid') {
    throw returnError(
      'RETURN_REFUND_PAYMENT_STATUS_INVALID',
      'Order payment status is not refundable.',
      { paymentStatus: order.paymentStatus }
    );
  }
  if (!order.paymentIntentId && !order.pspChargeId) {
    throw returnError(
      'RETURN_REFUND_MISSING_PSP_TARGET',
      'Missing Stripe identifiers for refund.'
    );
  }

  const refundIdempotencyKey =
    `return_refund:${current.id}:${current.refundAmountMinor}:${current.currency}`.slice(
      0,
      128
    );

  let refundResult: { refundId: string; status: string | null };
  try {
    refundResult = await createRefund({
      orderId: order.id,
      paymentIntentId: order.paymentIntentId,
      chargeId: order.pspChargeId,
      amountMinor: current.refundAmountMinor,
      idempotencyKey: refundIdempotencyKey,
    });
  } catch (error) {
    throw new InvalidPayloadError('Payment provider unavailable.', {
      code: 'PSP_UNAVAILABLE',
      details: {
        returnRequestId: current.id,
        reason: error instanceof Error ? error.message : String(error),
      },
    });
  }

  return applyTransition({
    returnRequestId: args.returnRequestId,
    actorUserId: args.actorUserId,
    requestId: args.requestId,
    expectedFrom: 'received',
    statusTo: 'refunded',
    action: 'return.refund',
    eventName: 'return_refunded',
    setClause: sql`
      refunded_at = ${new Date()},
      refunded_by = ${args.actorUserId},
      refund_provider_ref = ${refundResult.refundId}
    `,
    payload: {
      returnRequestId: args.returnRequestId,
      actorUserId: args.actorUserId,
      refundId: refundResult.refundId,
      refundStatus: refundResult.status,
      refundAmountMinor: current.refundAmountMinor,
      currency: current.currency,
    },
  });
}
