import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { orders } from '@/db/schema/shop';
import { createRefund } from '@/lib/psp/stripe';
import { InvalidPayloadError, OrderNotFoundError } from '../errors';
import { getOrderById } from './summary';

type RefundMetaRecord = {
  refundId: string;
  idempotencyKey: string;
  amountMinor: number;
  currency: string;
  createdAt: string;
  createdBy: string;
  status?: string | null;
};

function invalid(code: string, message: string): InvalidPayloadError {
  const err = new InvalidPayloadError(message); // 1 аргумент
  (err as any).code = code; // зберігаємо стабільний code
  return err;
}

function normalizeRefunds(
  meta: unknown,
  fallback: { currency: string; createdAt: string }
): RefundMetaRecord[] {
  const m = (meta ?? {}) as any;

  if (Array.isArray(m.refunds)) return m.refunds as RefundMetaRecord[];

  const legacy = m.refund;
  if (legacy?.id) {
    // backward-compat: переносимо старий одиночний refund у refunds[]
    return [
      {
        refundId: String(legacy.id),
        idempotencyKey: 'legacy:webhook',
        amountMinor: Number(legacy.amount ?? 0),
        currency: fallback.currency,
        createdAt: fallback.createdAt,
        createdBy: 'webhook',
        status: legacy.status ?? null,
      },
    ];
  }

  return [];
}

function appendRefund(meta: unknown, rec: RefundMetaRecord) {
  const base = ((meta ?? {}) as any) ?? {};
  const refunds = normalizeRefunds(base, {
    currency: rec.currency,
    createdAt: rec.createdAt,
  });

  // доменна ідемпотентність: не дублювати по idempotencyKey або refundId
  const exists = refunds.some(
    r => r.idempotencyKey === rec.idempotencyKey || r.refundId === rec.refundId
  );
  const nextRefunds = exists ? refunds : [...refunds, rec];

  return {
    ...base,
    refunds: nextRefunds,
    refundInitiatedAt: rec.createdAt, // для UI-disable
  };
}

function makeRefundIdempotencyKey(
  orderId: string,
  amountMinor: number,
  currency: string
): string {
  // тримай коротко; Stripe дозволяє довше, але це стабільно
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

  // Доменна ідемпотентність: якщо вже є запис — просто повертаємо summary
  const existingRefunds = normalizeRefunds(order.pspMetadata, {
    currency,
    createdAt: order.createdAt.toISOString(),
  });

  const already = existingRefunds.find(
    r => r.idempotencyKey === idempotencyKey
  );
  if (already) {
    return await getOrderById(orderId);
  }

  // Реальний Stripe call (idempotent на стороні Stripe)
  const { refundId, status } = await createRefund({
    orderId,
    paymentIntentId,
    chargeId,
    amountMinor,
    idempotencyKey,
  });

  const createdAtIso = new Date().toISOString();

  const nextMeta = appendRefund(order.pspMetadata, {
    refundId,
    idempotencyKey,
    amountMinor,
    currency,
    createdAt: createdAtIso,
    createdBy: requestedBy,
    status: status ?? null,
  });

  // Persist тільки metadata. payment_status НЕ чіпаємо (джерело істини — webhook)
  await db
    .update(orders)
    .set({ pspMetadata: nextMeta })
    .where(eq(orders.id, orderId));

  // Повертаємо як і раніше: order summary для API
  return await getOrderById(orderId);
}
