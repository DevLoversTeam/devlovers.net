import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { orders } from '@/db/schema/shop';
import { type PaymentStatus } from '@/lib/shop/payments';
import { type OrderSummaryWithMinor } from '@/lib/types/shop';

import { InvalidPayloadError, OrderNotFoundError } from '../errors';
import { resolvePaymentProvider } from './_shared';
import { getOrderItems, parseOrderSummary } from './summary';
import { guardedPaymentStatusUpdate } from './payment-state';

export async function setOrderPaymentIntent({
  orderId,
  paymentIntentId,
}: {
  orderId: string;
  paymentIntentId: string;
}): Promise<OrderSummaryWithMinor> {
  const [existing] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!existing) throw new OrderNotFoundError('Order not found');

  const provider = resolvePaymentProvider(existing);

  if (provider !== 'stripe') {
    throw new InvalidPayloadError(
      'Payment intent can only be set for stripe orders.'
    );
  }

  // New flow: pending -> requires_payment when attaching PI.
  // Keep requires_payment only for backward-compat (old orders created before this change).
  const allowed: PaymentStatus[] = ['pending', 'requires_payment'];
  if (!allowed.includes(existing.paymentStatus as PaymentStatus)) {
    throw new InvalidPayloadError(
      'Order cannot accept a payment intent from the current status.'
    );
  }

  if (
    existing.paymentIntentId &&
    existing.paymentIntentId !== paymentIntentId
  ) {
    throw new InvalidPayloadError(
      'Order already has a different payment intent.'
    );
  }

  if (existing.paymentIntentId === paymentIntentId) {
    const items = await getOrderItems(orderId);
    return parseOrderSummary(existing, items);
  }

  const res = await guardedPaymentStatusUpdate({
    orderId,
    paymentProvider: 'stripe',
    to: 'requires_payment',
    source: 'payment_intent',
    allowSameStateUpdate: true,
    set: {
      paymentIntentId,
      updatedAt: new Date(),
    },
  });

  if (!res.applied) {
    // Keep error semantics consistent with previous validation rules.
    // This also guarantees we won't ever do failed/refunded -> requires_payment.
    throw new InvalidPayloadError(
      `Order payment intent update blocked (${res.reason}).`
    );
  }

  const [updated] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!updated) throw new OrderNotFoundError('Order not found');

  const items = await getOrderItems(orderId);
  return parseOrderSummary(updated, items);
}
