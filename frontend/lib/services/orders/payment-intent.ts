import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { orders } from '@/db/schema/shop';
import { type PaymentStatus } from '@/lib/shop/payments';
import { type OrderSummaryWithMinor } from '@/lib/types/shop';

import { InvalidPayloadError, OrderNotFoundError } from '../errors';
import { resolvePaymentProvider } from './_shared';
import { getOrderItems, parseOrderSummary } from './summary';

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

  const [updated] = await db
    .update(orders)
    .set({
      paymentIntentId,
      paymentStatus: 'requires_payment',
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId))
    .returning();

  if (!updated) throw new Error('Failed to update order payment intent');

  const items = await getOrderItems(orderId);
  return parseOrderSummary(updated, items);
}

