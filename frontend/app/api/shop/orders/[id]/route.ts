import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { orderItems, orders } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { orderIdParamSchema } from '@/lib/validation/shop';
import { logError } from '@/lib/logging';

export const dynamic = 'force-dynamic';

function noStoreJson(body: unknown, init?: { status?: number }) {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
type OrderCurrency = (typeof orders.$inferSelect)["currency"];
type OrderDetailResponse = {
  id: string;
  userId: string | null;
  totalAmount: string;
  currency: OrderCurrency;
  paymentStatus:
    | 'pending'
    | 'requires_payment'
    | 'paid'
    | 'failed'
    | 'refunded';
  paymentProvider: string;
  paymentIntentId: string | null;
  stockRestored: boolean;
  restockedAt: string | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
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


function toOrderItem(
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
): OrderDetailResponse['items'][number] | null {
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

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return noStoreJson(
        { code: 'UNAUTHORIZED', error: 'Authentication required' },
        { status: 401 }
      );
    }

    const rawParams = await context.params;
    const parsed = orderIdParamSchema.safeParse(rawParams);
    if (!parsed.success) {
      return noStoreJson(
        { code: 'INVALID_ORDER_ID', error: 'Invalid order id' },
        { status: 400 }
      );
    }

    const isAdmin = user.role === 'admin';

    const whereClause = isAdmin
      ? eq(orders.id, parsed.data.id)
      : and(eq(orders.id, parsed.data.id), eq(orders.userId, user.id));

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
      .where(whereClause)


    if (rows.length === 0) {
      return noStoreJson({ code: 'ORDER_NOT_FOUND' }, { status: 404 });
    }

    const base = rows[0]!.order;

    const items = rows
      .map(r => toOrderItem(r.item))
      .filter((i): i is NonNullable<typeof i> => i !== null);

    const response: OrderDetailResponse = {
      ...base,
      createdAt: base.createdAt.toISOString(),
      updatedAt: base.updatedAt.toISOString(),
      restockedAt: base.restockedAt ? base.restockedAt.toISOString() : null,
      items,
    };

    return noStoreJson({ success: true, order: response }, { status: 200 });
  } catch (error) {
    logError('Public order detail failed', error);
    return noStoreJson(
      { code: 'INTERNAL_ERROR', error: 'internal_error' },
      { status: 500 }
    );
  }
}
