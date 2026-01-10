import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { orders } from '@/db/schema/shop';
import { type PaymentStatus } from '@/lib/shop/payments';
import { type OrderSummaryWithMinor } from '@/lib/types/shop';
import { InvalidPayloadError, OrderNotFoundError } from '../errors';
import { resolvePaymentProvider } from './_shared';
import { restockOrder } from './restock';
import { guardedPaymentStatusUpdate } from './payment-state';
import { getOrderById } from './summary';

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

  const res = await guardedPaymentStatusUpdate({
    orderId,
    paymentProvider: order.paymentProvider,
    to: 'refunded',
    source: 'admin',
    note: 'refundOrder()',
    set: { updatedAt: new Date(), status: 'CANCELED' },
  });

  if (!res.applied) {
    if (res.reason === 'ALREADY_IN_STATE') {
      // idempotent
    } else if (res.reason === 'INVALID_TRANSITION') {
      throw new InvalidPayloadError(
        'Order cannot be refunded from the current status.'
      );
    } else if (res.reason === 'PROVIDER_MISMATCH') {
      throw new InvalidPayloadError('Order payment provider mismatch.');
    } else if (res.reason === 'BLOCKED') {
      throw new InvalidPayloadError('Refund blocked by safety gates.');
    } else {
      throw new OrderNotFoundError('Order not found');
    }
  }

  const canRestock =
    res.applied || (!res.applied && res.reason === 'ALREADY_IN_STATE');

  if (canRestock && !order.stockRestored) {
    await restockOrder(orderId, { reason: 'refunded' });
  }

  return getOrderById(orderId);
}
