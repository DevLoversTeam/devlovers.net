import crypto from 'node:crypto';

import {
  and,
  eq,
  inArray,
  isNull,
  lt,
  or,
  sql,
  type SQLWrapper,
} from 'drizzle-orm';

import { db } from '@/db';
import { orders } from '@/db/schema/shop';
import { isCanonicalEventsDualWriteEnabled } from '@/lib/env/shop-canonical-events';
import { logDebug, logError } from '@/lib/logging';
import { retrieveRefund } from '@/lib/psp/stripe';
import { buildPaymentEventDedupeKey } from '@/lib/services/shop/events/dedupe-key';

import {
  normalizeRefundsFromMeta,
  type RefundMetaRecord,
} from './psp-metadata/refunds';
import { restockOrder } from './restock';

type StripeReconcileSource = 'stripe_webhook' | 'stripe_reconciliation';

type RefundContainmentSnapshot = {
  requestedAt: string | null;
  refundId: string | null;
  orderShippingStatusBefore: string | null;
  latestShipmentIdBefore: string | null;
  latestShipmentStatusBefore: string | null;
  hadShipmentRowBefore: boolean;
  shippingRequiredBefore: boolean;
  shippingProviderBefore: string | null;
  shippingMethodCodeBefore: string | null;
  trackingNumberBefore: string | null;
  shippingProviderRefBefore: string | null;
};

type StripeRefundOrderRow = {
  id: string;
  paymentProvider: string;
  paymentStatus: string;
  status: string;
  inventoryStatus: string | null;
  currency: string;
  totalAmountMinor: number;
  paymentIntentId: string | null;
  pspChargeId: string | null;
  pspPaymentMethod: string | null;
  pspStatusReason: string | null;
  pspMetadata: unknown;
  shippingRequired: boolean | null;
  shippingProvider: string | null;
  shippingMethodCode: string | null;
  shippingStatus: string | null;
  stockRestored: boolean | null;
  restockedAt: Date | null;
  createdAt: Date;
};

type ReconcileRefundOrderResult =
  | 'finalized_success'
  | 'restored_failure'
  | 'pending'
  | 'noop';

function compactConditions(conds: Array<SQLWrapper | undefined>): SQLWrapper[] {
  return conds.filter((c): c is SQLWrapper => Boolean(c));
}

function readRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const anyRes = res as { rows?: unknown };
  if (Array.isArray(anyRes?.rows)) return anyRes.rows as T[];
  return [];
}

function readMetaObject(meta: unknown): Record<string, unknown> {
  return meta && typeof meta === 'object' && !Array.isArray(meta)
    ? (meta as Record<string, unknown>)
    : {};
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toBoolean(value: unknown): boolean {
  return value === true;
}

function parseContainmentSnapshot(meta: unknown): RefundContainmentSnapshot {
  const root = readMetaObject(meta);
  const raw = readMetaObject(root.refundContainment);

  return {
    requestedAt: asTrimmedString(raw.requestedAt),
    refundId: asTrimmedString(raw.refundId),
    orderShippingStatusBefore: asTrimmedString(raw.orderShippingStatusBefore),
    latestShipmentIdBefore: asTrimmedString(raw.latestShipmentIdBefore),
    latestShipmentStatusBefore: asTrimmedString(raw.latestShipmentStatusBefore),
    hadShipmentRowBefore: toBoolean(raw.hadShipmentRowBefore),
    shippingRequiredBefore: toBoolean(raw.shippingRequiredBefore),
    shippingProviderBefore: asTrimmedString(raw.shippingProviderBefore),
    shippingMethodCodeBefore: asTrimmedString(raw.shippingMethodCodeBefore),
    trackingNumberBefore: asTrimmedString(raw.trackingNumberBefore),
    shippingProviderRefBefore: asTrimmedString(raw.shippingProviderRefBefore),
  };
}

function chooseRefundRecord(
  order: StripeRefundOrderRow
): RefundMetaRecord | null {
  const snapshot = parseContainmentSnapshot(order.pspMetadata);
  const refunds = normalizeRefundsFromMeta(order.pspMetadata, {
    currency: order.currency,
    createdAt: order.createdAt.toISOString(),
  });

  if (snapshot.refundId) {
    const bySnapshot = refunds.find(r => r.refundId === snapshot.refundId);
    if (bySnapshot) return bySnapshot;
  }

  return refunds[refunds.length - 1] ?? null;
}

function updateRefundMetaStatus(args: {
  prevMeta: unknown;
  refundId: string;
  status: string | null;
}): Record<string, unknown> {
  const base = readMetaObject(args.prevMeta);
  const existingRefunds = normalizeRefundsFromMeta(base, {
    currency: 'USD',
    createdAt: new Date(0).toISOString(),
  });

  const updatedRefunds = existingRefunds.map(record =>
    record.refundId === args.refundId
      ? { ...record, status: args.status ?? null }
      : record
  );

  return {
    ...base,
    refunds: updatedRefunds,
  };
}

async function loadStripeRefundOrder(
  orderId: string
): Promise<StripeRefundOrderRow | null> {
  const [order] = await db
    .select({
      id: orders.id,
      paymentProvider: orders.paymentProvider,
      paymentStatus: orders.paymentStatus,
      status: orders.status,
      inventoryStatus: orders.inventoryStatus,
      currency: orders.currency,
      totalAmountMinor: orders.totalAmountMinor,
      paymentIntentId: orders.paymentIntentId,
      pspChargeId: orders.pspChargeId,
      pspPaymentMethod: orders.pspPaymentMethod,
      pspStatusReason: orders.pspStatusReason,
      pspMetadata: orders.pspMetadata,
      shippingRequired: orders.shippingRequired,
      shippingProvider: orders.shippingProvider,
      shippingMethodCode: orders.shippingMethodCode,
      shippingStatus: orders.shippingStatus,
      stockRestored: orders.stockRestored,
      restockedAt: orders.restockedAt,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order) return null;

  return {
    ...order,
    totalAmountMinor: Number(order.totalAmountMinor ?? 0),
    paymentIntentId: order.paymentIntentId ?? null,
    pspChargeId: order.pspChargeId ?? null,
    pspPaymentMethod: order.pspPaymentMethod ?? null,
    pspStatusReason: order.pspStatusReason ?? null,
    shippingProvider: order.shippingProvider ?? null,
    shippingMethodCode: order.shippingMethodCode ?? null,
    shippingStatus: order.shippingStatus ?? null,
    inventoryStatus: order.inventoryStatus ?? null,
    stockRestored: order.stockRestored ?? null,
    restockedAt: order.restockedAt ?? null,
  };
}

export async function finalizeStripeRefundSuccess(args: {
  order: StripeRefundOrderRow;
  now: Date;
  refundId: string | null;
  refundStatus: string | null;
  refundReason: string | null;
  paymentIntentId: string | null;
  chargeId: string | null;
  nextMeta: Record<string, unknown>;
  requireContainment: boolean;
  source: StripeReconcileSource;
  eventRef: string;
  restockAlreadyClaimed?: boolean;
  restockWorkerId?: string;
}) {
  const canonicalDualWriteEnabled = isCanonicalEventsDualWriteEnabled();
  const canonicalEventDedupeKey = buildPaymentEventDedupeKey({
    provider: 'stripe',
    orderId: args.order.id,
    eventName: 'refund_applied',
    eventSource: args.source,
    stripeEventId: args.eventRef,
    paymentIntentId: args.paymentIntentId,
    chargeId: args.chargeId,
    refundId: args.refundId,
  });

  const res = await db.execute(sql`
    with updated_order as (
      update orders
      set payment_status = 'refunded',
          status = 'CANCELED',
          updated_at = ${args.now},
          psp_charge_id = ${args.chargeId},
          psp_payment_method = ${args.order.pspPaymentMethod},
          psp_status_reason = ${args.refundReason ?? args.refundStatus ?? 'refunded'},
          psp_metadata = ${JSON.stringify(args.nextMeta)}::jsonb
      where id = ${args.order.id}::uuid
        and payment_provider = 'stripe'
        and payment_status = 'paid'
        and ${
          args.requireContainment
            ? sql`psp_status_reason = 'REFUND_REQUESTED'`
            : sql`true`
        }
      returning
        id,
        total_amount_minor,
        currency
    ),
    inserted_payment_event as (
      insert into payment_events (
        order_id,
        provider,
        event_name,
        event_source,
        event_ref,
        attempt_id,
        provider_payment_intent_id,
        provider_charge_id,
        amount_minor,
        currency,
        payload,
        dedupe_key,
        occurred_at,
        created_at
      )
      select
        uo.id,
        'stripe',
        'refund_applied',
        ${args.source},
        ${args.eventRef},
        null,
        ${args.paymentIntentId},
        ${args.chargeId},
        uo.total_amount_minor::bigint,
        uo.currency,
        ${JSON.stringify({
          eventRef: args.eventRef,
          refundId: args.refundId,
          paymentIntentId: args.paymentIntentId,
          chargeId: args.chargeId,
        })}::jsonb,
        ${canonicalEventDedupeKey},
        ${args.now},
        ${args.now}
      from updated_order uo
      where ${canonicalDualWriteEnabled} = true
      on conflict (dedupe_key) do nothing
      returning id
    )
    select (select count(*)::int from updated_order) as updated_count
  `);

  const updatedCount =
    Number(readRows<{ updated_count?: number }>(res)[0]?.updated_count ?? 0) >
    0;

  if (updatedCount || args.order.paymentStatus === 'refunded') {
    await restockOrder(args.order.id, {
      reason: 'refunded',
      alreadyClaimed: args.restockAlreadyClaimed,
      workerId: args.restockWorkerId,
    });
    return true;
  }

  const latest = await loadStripeRefundOrder(args.order.id);
  if (latest?.paymentStatus === 'refunded') {
    await restockOrder(args.order.id, {
      reason: 'refunded',
      alreadyClaimed: args.restockAlreadyClaimed,
      workerId: args.restockWorkerId,
    });
    return true;
  }

  return false;
}

async function restoreShippingAfterRefundFailure(args: {
  orderId: string;
  snapshot: RefundContainmentSnapshot;
  now: Date;
}) {
  const shippingEligible =
    args.snapshot.shippingRequiredBefore &&
    args.snapshot.shippingProviderBefore === 'nova_poshta' &&
    args.snapshot.shippingMethodCodeBefore !== null;

  const targetOrderShippingStatus =
    args.snapshot.orderShippingStatusBefore ??
    (shippingEligible ? 'queued' : null);

  const shouldRequeueExistingShipment =
    args.snapshot.latestShipmentIdBefore !== null &&
    (args.snapshot.latestShipmentStatusBefore === 'queued' ||
      args.snapshot.latestShipmentStatusBefore === 'processing' ||
      args.snapshot.latestShipmentStatusBefore === 'failed');

  if (shouldRequeueExistingShipment) {
    await db.execute(sql`
      update shipping_shipments
      set status = 'queued',
          next_attempt_at = ${args.now},
          last_error_code = null,
          last_error_message = null,
          lease_owner = null,
          lease_expires_at = null,
          updated_at = ${args.now}
      where id = ${args.snapshot.latestShipmentIdBefore}::uuid
        and order_id = ${args.orderId}::uuid
        and status = 'needs_attention'
    `);
  } else if (
    shippingEligible &&
    !args.snapshot.hadShipmentRowBefore &&
    targetOrderShippingStatus === 'queued'
  ) {
    await db.execute(sql`
      insert into shipping_shipments (
        order_id,
        provider,
        status,
        attempt_count,
        created_at,
        updated_at
      )
      values (
        ${args.orderId}::uuid,
        'nova_poshta',
        'queued',
        0,
        ${args.now},
        ${args.now}
      )
      on conflict (order_id) do update
      set status = 'queued',
          next_attempt_at = ${args.now},
          lease_owner = null,
          lease_expires_at = null,
          updated_at = ${args.now}
      where shipping_shipments.provider = 'nova_poshta'
        and shipping_shipments.status is distinct from 'queued'
    `);
  }

  if (targetOrderShippingStatus !== null) {
    await db.execute(sql`
      update orders
      set shipping_status = ${targetOrderShippingStatus}::shipping_status,
          updated_at = ${args.now}
      where id = ${args.orderId}::uuid
        and shipping_status = 'cancelled'::shipping_status
    `);
  }
}

export async function restoreStripeRefundFailure(args: {
  order: StripeRefundOrderRow;
  now: Date;
  refundId: string;
  refundStatus: string | null;
  refundReason: string | null;
  chargeId: string | null;
  paymentIntentId: string | null;
  nextMeta: Record<string, unknown>;
}) {
  const containmentSnapshot = parseContainmentSnapshot(args.order.pspMetadata);

  const res = await db.execute(sql`
    update orders
    set payment_status = 'paid',
        status = 'PAID',
        updated_at = ${args.now},
        psp_charge_id = ${args.chargeId},
        psp_payment_method = ${args.order.pspPaymentMethod},
        psp_status_reason = ${args.refundReason ?? args.refundStatus ?? 'failed'},
        psp_metadata = ${JSON.stringify(args.nextMeta)}::jsonb
    where id = ${args.order.id}::uuid
      and payment_provider = 'stripe'
      and payment_status = 'paid'
      and psp_status_reason = 'REFUND_REQUESTED'
    returning id
  `);

  const restored = readRows<{ id: string }>(res).length > 0;
  if (restored) {
    await restoreShippingAfterRefundFailure({
      orderId: args.order.id,
      snapshot: containmentSnapshot,
      now: args.now,
    });
    return true;
  }

  const latest = await loadStripeRefundOrder(args.order.id);
  return (
    latest?.paymentStatus === 'paid' &&
    latest.pspStatusReason !== 'REFUND_REQUESTED'
  );
}

export async function reconcileStripeRefundOrder(args: {
  orderId: string;
  source?: StripeReconcileSource;
  restockAlreadyClaimed?: boolean;
  restockWorkerId?: string;
}): Promise<ReconcileRefundOrderResult> {
  const order = await loadStripeRefundOrder(args.orderId);
  if (!order || order.paymentProvider !== 'stripe') return 'noop';

  const refundRecord = chooseRefundRecord(order);
  if (!refundRecord?.refundId) return 'noop';

  const refund = await retrieveRefund(refundRecord.refundId);
  const now = new Date();
  const nextMeta = updateRefundMetaStatus({
    prevMeta: order.pspMetadata,
    refundId: refund.refundId,
    status: refund.status ?? null,
  });

  if (refund.status === 'succeeded') {
    const finalized = await finalizeStripeRefundSuccess({
      order,
      now,
      refundId: refund.refundId,
      refundStatus: refund.status ?? null,
      refundReason: refund.reason ?? null,
      paymentIntentId: refund.paymentIntentId ?? order.paymentIntentId,
      chargeId: refund.chargeId ?? order.pspChargeId,
      nextMeta,
      requireContainment: true,
      source: args.source ?? 'stripe_reconciliation',
      eventRef: refund.refundId,
      restockAlreadyClaimed: args.restockAlreadyClaimed,
      restockWorkerId: args.restockWorkerId,
    });

    return finalized ? 'finalized_success' : 'noop';
  }

  if (refund.status === 'failed' || refund.status === 'canceled') {
    const restored = await restoreStripeRefundFailure({
      order,
      now,
      refundId: refund.refundId,
      refundStatus: refund.status ?? null,
      refundReason: refund.reason ?? null,
      chargeId: refund.chargeId ?? order.pspChargeId,
      paymentIntentId: refund.paymentIntentId ?? order.paymentIntentId,
      nextMeta,
    });
    return restored ? 'restored_failure' : 'noop';
  }

  await db
    .update(orders)
    .set({
      updatedAt: now,
      pspMetadata: nextMeta,
    })
    .where(
      and(
        eq(orders.id, order.id),
        eq(orders.paymentProvider, 'stripe'),
        eq(orders.pspStatusReason, 'REFUND_REQUESTED')
      )
    );

  return 'pending';
}

async function claimRefundOrdersForSweepBatch(args: {
  now: Date;
  claimExpiresAt: Date;
  runId: string;
  workerId: string;
  batchSize: number;
  baseConditions: SQLWrapper[];
}): Promise<Array<{ id: string }>> {
  const claimable = db
    .select({ id: orders.id })
    .from(orders)
    .where(and(...args.baseConditions))
    .orderBy(orders.updatedAt, orders.createdAt)
    .limit(args.batchSize)
    .for('update', { skipLocked: true });

  return db
    .update(orders)
    .set({
      sweepClaimedAt: args.now,
      sweepClaimExpiresAt: args.claimExpiresAt,
      sweepRunId: args.runId,
      sweepClaimedBy: args.workerId,
      updatedAt: args.now,
    })
    .where(
      and(
        inArray(orders.id, claimable),
        or(
          isNull(orders.sweepClaimExpiresAt),
          lt(orders.sweepClaimExpiresAt, args.now)
        )
      )
    )
    .returning({ id: orders.id });
}

export async function reconcileStaleStripeRefundOrders(options?: {
  olderThanMinutes?: number;
  batchSize?: number;
  claimTtlMinutes?: number;
  workerId?: string;
  timeBudgetMs?: number;
  orderIds?: string[];
}): Promise<number> {
  const olderThanMinutes = Math.max(
    1,
    Math.min(60 * 24 * 7, Math.floor(Number(options?.olderThanMinutes ?? 15)))
  );
  const batchSize = Math.max(
    1,
    Math.min(100, Math.floor(Number(options?.batchSize ?? 50)))
  );
  const claimTtlMinutes = Math.max(
    1,
    Math.min(60, Math.floor(Number(options?.claimTtlMinutes ?? 5)))
  );
  const timeBudgetMs = Math.max(
    0,
    Math.min(25_000, Math.floor(Number(options?.timeBudgetMs ?? 20_000)))
  );
  const deadlineMs = Date.now() + timeBudgetMs;
  const workerId =
    (options?.workerId ?? 'stripe-refund-reconcile-sweep').trim() ||
    'stripe-refund-reconcile-sweep';

  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
  const runId = crypto.randomUUID();
  let processed = 0;
  let loopCount = 0;

  while (true) {
    if (Date.now() >= deadlineMs) break;
    loopCount += 1;

    const now = new Date();
    const claimExpiresAt = new Date(
      now.getTime() + claimTtlMinutes * 60 * 1000
    );

    const baseConditions = compactConditions([
      eq(orders.paymentProvider, 'stripe'),
      eq(orders.paymentStatus, 'paid'),
      eq(orders.pspStatusReason, 'REFUND_REQUESTED'),
      or(
        isNull(orders.sweepClaimExpiresAt),
        lt(orders.sweepClaimExpiresAt, now)
      ),
      options?.orderIds?.length
        ? inArray(orders.id, options.orderIds)
        : undefined,
      options?.orderIds?.length ? undefined : lt(orders.updatedAt, cutoff),
    ]);

    const claimed = await claimRefundOrdersForSweepBatch({
      now,
      claimExpiresAt,
      runId,
      workerId,
      batchSize,
      baseConditions,
    });

    logDebug('orders_sweep_claim_batch', {
      sweep: 'stripe_refund_reconcile',
      runId,
      loopCount,
      claimedCount: claimed.length,
    });

    if (!claimed.length) break;

    for (const { id } of claimed) {
      if (Date.now() >= deadlineMs) break;

      try {
        const result = await reconcileStripeRefundOrder({
          orderId: id,
          source: 'stripe_reconciliation',
          restockAlreadyClaimed: true,
          restockWorkerId: workerId,
        });
        if (result === 'finalized_success' || result === 'restored_failure') {
          processed += 1;
        }
      } catch (error) {
        logError('stripe_refund_reconcile_failed', error, {
          orderId: id,
          workerId,
          runId,
          code: 'STRIPE_REFUND_RECONCILE_FAILED',
        });
      }
    }
  }

  return processed;
}
