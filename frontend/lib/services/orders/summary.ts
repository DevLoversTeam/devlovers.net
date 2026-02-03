import { eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { orderItems, orders, products } from '@/db/schema/shop';
import { fromCents, fromDbMoney } from '@/lib/shop/money';
import { type OrderDetail, type OrderSummaryWithMinor } from '@/lib/types/shop';

import { OrderNotFoundError, OrderStateInvalidError } from '../errors';
<<<<<<< HEAD

=======
>>>>>>> 601e032c399164dfc128ab2dee5fe52dd66d2caf
import {
  type DbClient,
  type OrderRow,
  requireMinor,
  resolvePaymentProvider,
} from './_shared';

export type OrderItemForSummary = {
  productId: string;
  selectedSize: string;
  selectedColor: string;
  quantity: number;
  unitPrice: unknown;
  lineTotal: unknown;
  unitPriceMinor: unknown;
  lineTotalMinor: unknown;
  productTitle: string | null;
  productSlug: string | null;
};

export const orderItemSummarySelection = {
  productId: orderItems.productId,
  selectedSize: orderItems.selectedSize,
  selectedColor: orderItems.selectedColor,
  quantity: orderItems.quantity,
  unitPrice: orderItems.unitPrice,
  lineTotal: orderItems.lineTotal,
  unitPriceMinor: orderItems.unitPriceMinor,
  lineTotalMinor: orderItems.lineTotalMinor,
  productTitle: sql<
    string | null
  >`coalesce(${orderItems.productTitle}, ${products.title})`,
  productSlug: sql<
    string | null
  >`coalesce(${orderItems.productSlug}, ${products.slug})`,
};

export function parseOrderSummary(
  order: OrderRow,
  items: OrderItemForSummary[]
): OrderSummaryWithMinor {
  function readLegacyMoneyCentsOrThrow(
    value: unknown,
    ctx: { orderId: string; field: string }
  ): number {
    try {
      return fromDbMoney(value);
    } catch {
      throw new OrderStateInvalidError(
        `Order ${ctx.orderId} has invalid legacy money in field "${ctx.field}"`,
        { orderId: ctx.orderId, field: ctx.field, rawValue: value }
      );
    }
  }

  const normalizedItems = items.map(item => {
    const unitPriceMinorMaybe = item.unitPriceMinor;
    const unitPriceMinor =
      unitPriceMinorMaybe === null || unitPriceMinorMaybe === undefined
        ? readLegacyMoneyCentsOrThrow(item.unitPrice, {
            orderId: order.id,
            field: 'order_items.unitPrice',
          })
        : requireMinor(unitPriceMinorMaybe, {
            orderId: order.id,
            field: 'order_items.unitPriceMinor',
          });

    const lineTotalMinorMaybe = item.lineTotalMinor;
    const lineTotalMinor =
      lineTotalMinorMaybe === null || lineTotalMinorMaybe === undefined
        ? readLegacyMoneyCentsOrThrow(item.lineTotal, {
            orderId: order.id,
            field: 'order_items.lineTotal',
          })
        : requireMinor(lineTotalMinorMaybe, {
            orderId: order.id,
            field: 'order_items.lineTotalMinor',
          });

    return {
      productId: item.productId,
      productTitle: item.productTitle ?? '',
      productSlug: item.productSlug ?? '',
      selectedSize: item.selectedSize ?? '',
      selectedColor: item.selectedColor ?? '',
      quantity: item.quantity,
      unitPriceMinor,
      lineTotalMinor,
      unitPrice: fromCents(unitPriceMinor),
      lineTotal: fromCents(lineTotalMinor),
    };
  });

  const totalAmountMinor =
    order.totalAmountMinor == null
      ? readLegacyMoneyCentsOrThrow(order.totalAmount, {
          orderId: order.id,
          field: 'orders.totalAmount',
        })
      : requireMinor(order.totalAmountMinor, {
          orderId: order.id,
          field: 'orders.totalAmountMinor',
        });

  const paymentProvider = resolvePaymentProvider(order);

  if (paymentProvider === 'none' && order.paymentIntentId) {
    throw new OrderStateInvalidError(
      `Order ${order.id} is inconsistent: paymentProvider=none but paymentIntentId is set`,
      { orderId: order.id }
    );
  }

  return {
    id: order.id,
    totalAmountMinor,
    totalAmount: fromCents(totalAmountMinor),
    currency: order.currency,
    paymentStatus: order.paymentStatus,
    paymentProvider,
    paymentIntentId: order.paymentIntentId ?? undefined,
    createdAt: order.createdAt,
    items: normalizedItems,
  };
}

export async function getOrderItems(orderId: string) {
  return db
    .select(orderItemSummarySelection)
    .from(orderItems)
    .leftJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, orderId));
}

export async function getOrderById(id: string): Promise<OrderDetail> {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, id))
    .limit(1);
  if (!order) throw new OrderNotFoundError('Order not found');

  const items = await getOrderItems(id);
  return parseOrderSummary(order, items);
}

export async function getOrderSummary(
  id: string
): Promise<OrderSummaryWithMinor> {
  return getOrderById(id);
}

export async function getOrderByIdempotencyKey(
  dbClient: DbClient,
  key: string
): Promise<OrderSummaryWithMinor | null> {
  const [order] = await dbClient
    .select()
    .from(orders)
    .where(eq(orders.idempotencyKey, key))
    .limit(1);
  if (!order) return null;

  const items = await dbClient
    .select(orderItemSummarySelection)
    .from(orderItems)
    .leftJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, order.id));

  return parseOrderSummary(order, items);
}
