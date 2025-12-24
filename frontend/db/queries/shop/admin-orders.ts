import 'server-only';

import { count, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { orderItems, orders } from '@/db/schema';
import type { CurrencyCode } from '@/lib/shop/currency';

export type AdminOrderListItem = {
  id: string;
  userId: string | null;
  totalAmount: string;
  currency: CurrencyCode;
  paymentStatus:
    | 'pending'
    | 'requires_payment'
    | 'paid'
    | 'failed'
    | 'refunded';
  paymentProvider: string;
  paymentIntentId: string | null;
  createdAt: Date;
  itemCount: number;
};

export type AdminOrderDetail = {
  id: string;
  userId: string | null;
  totalAmount: string;
  currency: CurrencyCode;
  paymentStatus:
    | 'pending'
    | 'requires_payment'
    | 'paid'
    | 'failed'
    | 'refunded';
  paymentProvider: string;
  paymentIntentId: string | null;
  stockRestored: boolean;
  restockedAt: Date | null;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    productId: string;
    productTitle: string | null;
    productSlug: string | null;
    productSku: string | null;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
  }>;
};

export async function getAdminOrdersPage(options: {
  limit: number;
  offset: number;
}) {
  const limit = Math.max(1, Math.min(100, options.limit));
  const offset = Math.max(0, options.offset);

  const [{ value: total }] = await db.select({ value: count() }).from(orders);
  const totalCount =
    typeof total === 'bigint' ? Number(total) : Number(total ?? 0);

  const rows = await db
    .select({
      id: orders.id,
      userId: orders.userId,
      totalAmount: orders.totalAmount,
      currency: orders.currency,
      paymentStatus: orders.paymentStatus,
      paymentProvider: orders.paymentProvider,
      paymentIntentId: orders.paymentIntentId,
      createdAt: orders.createdAt,
      itemCount: sql<number>`count(${orderItems.id})`.mapWith(Number),
    })
    .from(orders)
    .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
    .groupBy(orders.id)
    .orderBy(desc(orders.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    items: rows as AdminOrderListItem[],
    total: totalCount,
  };
}

function toAdminOrderItem(
  item: {
    id: string | null;
    productId: string | null;
    productTitle: string | null;
    productSlug: string | null;
    productSku: string | null;
    quantity: number | null;
    unitPrice: string | null;
    lineTotal: string | null;
  } | null
): AdminOrderDetail['items'][number] | null {
  if (!item || !item.id) return null;

  if (
    !item.productId ||
    item.quantity === null ||
    !item.unitPrice ||
    !item.lineTotal
  ) {
    throw new Error('Corrupt order item row: required columns are null');
  }

  return {
    id: item.id,
    productId: item.productId,
    productTitle: item.productTitle,
    productSlug: item.productSlug,
    productSku: item.productSku,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
  };
}

export async function getAdminOrderDetail(
  orderId: string
): Promise<AdminOrderDetail | null> {
  const rows = await db
    .select({
      order: {
        id: orders.id,
        userId: orders.userId,
        totalAmount: orders.totalAmount,
        currency: orders.currency,
        paymentStatus: orders.paymentStatus,
        paymentProvider: orders.paymentProvider,
        paymentIntentId: orders.paymentIntentId,
        stockRestored: orders.stockRestored,
        restockedAt: orders.restockedAt,
        idempotencyKey: orders.idempotencyKey,
        createdAt: orders.createdAt,
        updatedAt: orders.updatedAt,
      },
      item: {
        id: orderItems.id,
        productId: orderItems.productId,
        productTitle: orderItems.productTitle,
        productSlug: orderItems.productSlug,
        productSku: orderItems.productSku,
        quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice,
        lineTotal: orderItems.lineTotal,
      },
    })
    .from(orders)
    .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(eq(orders.id, orderId));

  if (rows.length === 0) return null;

  const base = rows[0]!.order;

  const items = rows
    .map(r => toAdminOrderItem(r.item))
    .filter((i): i is AdminOrderDetail['items'][number] => i !== null);

  return {
    ...base,
    items,
  };
}
