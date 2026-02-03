import crypto from 'node:crypto';

import { and, eq, isNull, lt, ne, or } from 'drizzle-orm';

import { db } from '@/db';
import { inventoryMoves, orders } from '@/db/schema/shop';
import { logWarn } from '@/lib/logging';
import { type PaymentStatus } from '@/lib/shop/payments';

import { OrderNotFoundError, OrderStateInvalidError } from '../errors';
import { applyReleaseMove } from '../inventory';
import { resolvePaymentProvider } from './_shared';
import { guardedPaymentStatusUpdate } from './payment-state';

const PAYMENT_STATUS_KEY = 'paymentStatus' as const;

const PAYMENT_STATUS_KEY = 'paymentStatus' as const;

export type RestockReason = 'failed' | 'refunded' | 'canceled' | 'stale';
export type RestockOptions = {
  reason?: RestockReason;
  alreadyClaimed?: boolean;
  claimTtlMinutes?: number;
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
      [PAYMENT_STATUS_KEY]: orders.paymentStatus,
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

  if (
    order.inventoryStatus === 'released' ||
    order.stockRestored ||
    order.restockedAt !== null
  )
    return;

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
    if (
      !isNoPayment &&
      order.paymentStatus === 'paid' &&
      reason !== 'refunded'
    ) {
      throw new OrderStateInvalidError(
        `Cannot terminalize an orphan paid order without refund reason.`,
        {
          orderId,
          details: { reason, [PAYMENT_STATUS_KEY]: order.paymentStatus },
        }
      );
    }

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
        extraWhere: eq(orders.restockedAt, now),
      });
    }

    return;
  }

  if (!isNoPayment && order.paymentStatus === 'paid' && reason !== 'refunded') {
    throw new OrderStateInvalidError(
      `Cannot restock a paid order without refund reason.`,
      {
        orderId,
        details: { reason, [PAYMENT_STATUS_KEY]: order.paymentStatus },
      }
    );
  }
  const claimTtlMinutes = options?.claimTtlMinutes ?? 5;
  const workerId = options?.workerId ?? 'restock';
  if (!options?.alreadyClaimed) {
    const claimed = await tryClaimRestockLease({
      orderId,
      workerId,
      claimTtlMinutes,
    });
    if (!claimed) return;
  }
  const now = new Date();

  await db
    .update(orders)
    .set({ inventoryStatus: 'release_pending', updatedAt: now })
    .where(and(eq(orders.id, orderId), ne(orders.inventoryStatus, 'released')));

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

      extraWhere: eq(orders.restockedAt, finalizedAt),
    });
  }
}
