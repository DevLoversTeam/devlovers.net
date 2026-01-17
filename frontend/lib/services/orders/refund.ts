import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { orders } from '@/db/schema/shop';
import { createRefund } from '@/lib/psp/stripe';
import { InvalidPayloadError, OrderNotFoundError } from '../errors';
import { getOrderById } from './summary';
import {
  appendRefundToMeta,
  normalizeRefundsFromMeta,
} from './psp-metadata/refunds';

function invalid(code: string, message: string): InvalidPayloadError {
  return new InvalidPayloadError(message, { code });
}

function makeRefundIdempotencyKey(
  orderId: string,
  amountMinor: number,
  currency: string
): string {
  return `refund:${orderId}:${amountMinor}:${currency}`.slice(0, 128);
}

export async function refundOrder(
  orderId: string,
  opts?: { requestedBy?: string }
) {
  const requestedBy = opts?.requestedBy ?? 'admin';

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order) throw new OrderNotFoundError(orderId);

  // Preconditions (fail-closed)
  if (order.paymentProvider !== 'stripe') {
    throw invalid(
      'REFUND_PROVIDER_NOT_STRIPE',
      'Refund is supported only for Stripe orders'
    );
  }

  if (order.paymentStatus !== 'paid') {
    throw invalid(
      'REFUND_ORDER_NOT_PAID',
      'Order is not refundable in current state'
    );
  }

  const currency = order.currency;
  const amountMinor = order.totalAmountMinor;

  if (!currency || !Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw invalid(
      'REFUND_ORDER_MONEY_INVALID',
      'Invalid order amount/currency'
    );
  }

  const paymentIntentId = order.paymentIntentId?.trim()
    ? order.paymentIntentId.trim()
    : null;
  const chargeId = order.pspChargeId?.trim() ? order.pspChargeId.trim() : null;

  if (!paymentIntentId && !chargeId) {
    throw invalid(
      'REFUND_MISSING_PSP_TARGET',
      'Missing Stripe identifiers (paymentIntentId/pspChargeId)'
    );
  }

  const idempotencyKey = makeRefundIdempotencyKey(
    orderId,
    amountMinor,
    currency
  );

  // Domain idempotency: if already recorded in metadata — return summary
  const existingRefunds = normalizeRefundsFromMeta(order.pspMetadata, {
    currency,
    createdAt: order.createdAt.toISOString(),
  });

  const already = existingRefunds.find(
    r => r.idempotencyKey === idempotencyKey
  );
  if (already) {
    return await getOrderById(orderId);
  }

  // Real Stripe call (Stripe-idempotent)
  const { refundId, status } = await createRefund({
    orderId,
    paymentIntentId,
    chargeId,
    amountMinor,
    idempotencyKey,
  });

  const now = new Date();
  const createdAtIso = now.toISOString();

  const nextMeta = appendRefundToMeta({
    prevMeta: order.pspMetadata,
    record: {
      refundId,
      idempotencyKey,
      amountMinor,
      currency,
      createdAt: createdAtIso,
      createdBy: requestedBy,
      status: status ?? null,
    },
  });

  // Persist ONLY metadata. payment_status not touched (source of truth = webhook)
  await db
    .update(orders)
    .set({
      updatedAt: now,
      pspStatusReason: 'REFUND_REQUESTED',
      pspMetadata: nextMeta,
    })
    .where(eq(orders.id, orderId));

  return await getOrderById(orderId);
}
