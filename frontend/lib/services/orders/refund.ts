import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { orders } from '@/db/schema/shop';
import { type PaymentStatus } from '@/lib/shop/payments';
import { type OrderSummaryWithMinor } from '@/lib/types/shop';

import { InvalidPayloadError, OrderNotFoundError } from '../errors';
import { resolvePaymentProvider } from './_shared';
import { getOrderItems, parseOrderSummary } from './summary';
import { restockOrder } from './restock';

export async function refundOrder(
  orderId: string
): Promise<OrderSummaryWithMinor> {
  const [order] = await db
    .select({
      id: orders.id,
      paymentProvider: orders.paymentProvider,
      paymentIntentId: orders.paymentIntentId,
      paymentStatus: orders.paymentStatus,
      stockRestored: orders.stockRestored,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order) throw new OrderNotFoundError('Order not found');
  const provider = resolvePaymentProvider(order);
  if (provider !== 'stripe') {
    throw new InvalidPayloadError(
      'Refunds are only supported for stripe orders.'
    );
  }

  const refundableStatuses: PaymentStatus[] = ['paid'];
  if (!refundableStatuses.includes(order.paymentStatus as PaymentStatus)) {
    throw new InvalidPayloadError(
      'Order cannot be refunded from the current status.'
    );
  }

  const [updatedOrder] = await db
    .update(orders)
    .set({ paymentStatus: 'refunded', updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning();

  if (!updatedOrder) throw new Error('Failed to update order status');

  const items = await getOrderItems(orderId);
  const summary = parseOrderSummary(updatedOrder, items);

  if (!order.stockRestored) {
    await restockOrder(orderId, { reason: 'refunded' });
  }

  return summary;
}
