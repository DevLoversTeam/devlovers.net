import crypto from 'node:crypto';
import { and, eq, isNull, lt, ne, or } from 'drizzle-orm';

import { applyReleaseMove } from '../inventory';
import { db } from '@/db';
import { inventoryMoves, orders } from '@/db/schema/shop';
import { type PaymentStatus } from '@/lib/shop/payments';
import { guardedPaymentStatusUpdate } from './payment-state';
import { OrderNotFoundError, OrderStateInvalidError } from '../errors';
import { resolvePaymentProvider } from './_shared';
import { logWarn } from '@/lib/logging';

export type RestockReason = 'failed' | 'refunded' | 'canceled' | 'stale';
export type RestockOptions = {
  reason?: RestockReason;
  /** If caller already claimed the order (e.g. sweep), skip local claim. */
  alreadyClaimed?: boolean;
  /** Lease TTL for restock claim */
  claimTtlMinutes?: number;
  /** Who is claiming (trace/debug) */
  workerId?: string;
};

async function tryClaimRestockLease(params: {
  orderId: string;
  workerId: string;
  claimTtlMinutes: number;
}): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(Date.now() + params.claimTtlMinutes * 60 * 1000);

  const [row] = await db
    .update(orders)
    .set({
      sweepClaimedAt: now,
      sweepClaimExpiresAt: expiresAt,
      sweepRunId: crypto.randomUUID(),
      sweepClaimedBy: params.workerId,
      updatedAt: now,
    })
    .where(
      and(
        eq(orders.id, params.orderId),
        eq(orders.stockRestored, false),
        // claim gate: only unclaimed or expired claims can be claimed
        or(
          isNull(orders.sweepClaimExpiresAt),
          lt(orders.sweepClaimExpiresAt, now)
        )
      )
    )
    .returning({ id: orders.id });

  return !!row;
}

export async function restockOrder(
  orderId: string,
  options?: RestockOptions
): Promise<void> {
  const reason = options?.reason;

  const [order] = await db
    .select({
      id: orders.id,
      paymentProvider: orders.paymentProvider,
      paymentStatus: orders.paymentStatus,
      paymentIntentId: orders.paymentIntentId,
      inventoryStatus: orders.inventoryStatus,
      stockRestored: orders.stockRestored,
      restockedAt: orders.restockedAt,
      failureCode: orders.failureCode,
      failureMessage: orders.failureMessage,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order) throw new OrderNotFoundError('Order not found');

  const isNoPayment = order.paymentProvider === 'none';
  const provider = resolvePaymentProvider(order);
  const transitionSource = options?.alreadyClaimed ? 'janitor' : 'system';

  // already released / legacy idempotency
  if (
    order.inventoryStatus === 'released' ||
    order.stockRestored ||
    order.restockedAt !== null
  )
    return;

  // If state says "none" we still may have reserve moves (crash between reserve and status update).
  const reservedMoves = await db
    .select({
      productId: inventoryMoves.productId,
      quantity: inventoryMoves.quantity,
    })
    .from(inventoryMoves)
    .where(
      and(
        eq(inventoryMoves.orderId, orderId),
        eq(inventoryMoves.type, 'reserve')
      )
    );

  if (reservedMoves.length === 0) {
    // safety: paid can only be terminalized via refund
    if (
      !isNoPayment &&
      order.paymentStatus === 'paid' &&
      reason !== 'refunded'
    ) {
      throw new OrderStateInvalidError(
        `Cannot terminalize an orphan paid order without refund reason.`,
        { orderId, details: { reason, paymentStatus: order.paymentStatus } }
      );
    }

    // No inventory was reserved. If caller gave no reason, do nothing (fail-closed).
    if (!reason) return;

    const now = new Date();
    const shouldCancel = reason === 'canceled';
    const shouldFail = reason === 'failed' || reason === 'stale';

    const orphanFailureCode =
      order.failureCode ??
      (reason === 'failed'
        ? 'FAILED_ORPHAN'
        : reason === 'canceled'
        ? 'CANCELED_ORPHAN'
        : 'STALE_ORPHAN');

    const [touched] = await db
      .update(orders)
      .set({
        ...(shouldFail ? { status: 'INVENTORY_FAILED' } : {}),
        ...(shouldCancel ? { status: 'CANCELED' } : {}),
        inventoryStatus: 'released',
        ...(shouldFail
          ? {
              failureCode: orphanFailureCode,
              failureMessage:
                order.failureMessage ??
                'Orphan order: no inventory reservation was recorded.',
            }
          : {}),
        stockRestored: true,
        restockedAt: now,
        updatedAt: now,
      })
      .where(and(eq(orders.id, orderId), eq(orders.stockRestored, false)))
      .returning({ id: orders.id });

    if (!touched) return;

    let normalizedStatus: PaymentStatus | undefined;
    if (reason === 'refunded' && !isNoPayment) normalizedStatus = 'refunded';
    else if (reason === 'failed' || reason === 'canceled' || reason === 'stale')
      normalizedStatus = 'failed';

    if (normalizedStatus) {
      await guardedPaymentStatusUpdate({
        orderId,
        paymentProvider: provider,
        to: normalizedStatus,
        source: transitionSource,
        // bind to this exact finalize marker (prevents races)
        extraWhere: eq(orders.restockedAt, now),
      });
    }

    return;
  }

  // safety: paid can only be released via refund
  // IMPORTANT: for payment_provider='none', payment_status='paid' is not a finality signal
  // (forced by DB CHECK). Finality is inventory_status='reserved'.
  if (!isNoPayment && order.paymentStatus === 'paid' && reason !== 'refunded') {
    throw new OrderStateInvalidError(
      `Cannot restock a paid order without refund reason.`,
      { orderId, details: { reason, paymentStatus: order.paymentStatus } }
    );
  }
  // If we have reserved moves, we must claim a lease to avoid concurrent double-processing.
  // (Actual stock safety is guaranteed by inventory_moves move_key, but lease prevents wasted work
  // and prevents "restocked_at" churn under concurrency.)
  const claimTtlMinutes = options?.claimTtlMinutes ?? 5;
  const workerId = options?.workerId ?? 'restock';
  if (!options?.alreadyClaimed) {
    const claimed = await tryClaimRestockLease({
      orderId,
      workerId,
      claimTtlMinutes,
    });
    if (!claimed) return; // someone else is processing
  }
  const now = new Date();

  await db
    .update(orders)
    .set({ inventoryStatus: 'release_pending', updatedAt: now })
    .where(and(eq(orders.id, orderId), ne(orders.inventoryStatus, 'released')));

  // Apply release moves. IMPORTANT invariant:
  // do NOT mark released/stockRestored/restockedAt unless all releases are CONFIRMED ok.

  const releaseFailures: Array<{ productId: string; reason: string }> = [];

  for (const item of reservedMoves) {
    try {
      const res: unknown = await applyReleaseMove(
        orderId,
        item.productId,
        item.quantity
      );

      const appliedFalse =
        typeof res === 'boolean'
          ? res === false
          : res && typeof res === 'object' && 'applied' in (res as any)
          ? (res as any).applied === false
          : false;

      if (appliedFalse) {
        const detail =
          res && typeof res === 'object' && 'reason' in (res as any)
            ? String((res as any).reason)
            : 'applied:false';

        logWarn('[shop.restock] release move not applied', {
          orderId,
          productId: item.productId,
          quantity: item.quantity,
          reason,
          workerId,
          detail,
        });
      }
    } catch (err) {
      releaseFailures.push({
        productId: item.productId,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (releaseFailures.length > 0) {
    const failAt = new Date();
    const details = releaseFailures
      .slice(0, 3)
      .map(f => `${f.productId}:${f.reason}`)
      .join(', ');

    const msg =
      `Release move not confirmed for ${releaseFailures.length} item(s): ` +
      details +
      (releaseFailures.length > 3 ? ', ...' : '');

    // FAIL-SAFE: leave order in a state janitor can safely retry.
    // Do NOT set: inventoryStatus='released' OR stockRestored=true OR restockedAt!=null.
    const shouldSetFailureCode = reason === 'failed' || reason === 'stale';
    await db
      .update(orders)
      .set({
        inventoryStatus: 'release_pending',
        stockRestored: false,
        restockedAt: null,
        ...(shouldSetFailureCode
          ? { failureCode: order.failureCode ?? 'RESTOCK_RELEASE_FAILED' }
          : {}),
        failureMessage: order.failureMessage
          ? `${order.failureMessage} | ${msg}`
          : msg,
        updatedAt: failAt,
      })
      .where(eq(orders.id, orderId));

    return;
  }
  // FINALIZE ONCE: only one caller may flip stock_restored/restocked_at
  // If RETURNING is empty => already finalized by another worker (or previous attempt).
  const finalizedAt = new Date();
  const [finalized] = await db
    .update(orders)
    .set({
      stockRestored: true,
      restockedAt: finalizedAt,
      updatedAt: finalizedAt,
    })
    .where(and(eq(orders.id, orderId), eq(orders.stockRestored, false)))
    .returning({ id: orders.id });

  if (!finalized) return;

  let normalizedStatus: PaymentStatus | undefined;
  if (reason === 'refunded' && !isNoPayment) normalizedStatus = 'refunded';
  else if (reason === 'failed' || reason === 'canceled' || reason === 'stale')
    normalizedStatus = 'failed';

  const shouldCancel = reason === 'canceled';
  const shouldFail = reason === 'failed' || reason === 'stale';
  await db
    .update(orders)
    .set({
      inventoryStatus: 'released',
      updatedAt: finalizedAt,
      ...(shouldFail ? { status: 'INVENTORY_FAILED' } : {}),
      ...(shouldCancel ? { status: 'CANCELED' } : {}),
    })
    .where(eq(orders.id, orderId));

  if (normalizedStatus) {
    await guardedPaymentStatusUpdate({
      orderId,
      paymentProvider: provider,
      to: normalizedStatus,
      source: transitionSource,
      // bind to finalize-once marker
      extraWhere: eq(orders.restockedAt, finalizedAt),
    });
  }
}
