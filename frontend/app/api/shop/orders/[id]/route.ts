import 'server-only';

import crypto from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { orderItems, orders } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { logError, logWarn } from '@/lib/logging';
import { orderIdParamSchema } from '@/lib/validation/shop';

export const dynamic = 'force-dynamic';

function noStoreJson(body: unknown, init?: { status?: number }) {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
type OrderCurrency = (typeof orders.$inferSelect)['currency'];
type OrderPaymentStatus = (typeof orders.$inferSelect)['paymentStatus'];
type OrderDetailResponse = {
  id: string;
  userId: string | null;
  totalAmount: string;
  currency: OrderCurrency;
  paymentStatus: OrderPaymentStatus;
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
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startedAtMs = Date.now();

  const requestId =
    request.headers.get('x-request-id')?.trim() || crypto.randomUUID();

  const baseMeta = {
    requestId,
    route: request.nextUrl.pathname,
    method: request.method,
  };

  let orderIdForLog: string | null = null;

  try {
    const user = await getCurrentUser();
    if (!user) {
      logWarn('public_order_detail_unauthorized', {
        ...baseMeta,
        code: 'UNAUTHORIZED',
        durationMs: Date.now() - startedAtMs,
      });

      return noStoreJson(
        { code: 'UNAUTHORIZED', error: 'Authentication required' },
        { status: 401 }
      );
    }

    const rawParams = await context.params;
    const parsed = orderIdParamSchema.safeParse(rawParams);
    if (!parsed.success) {
      logWarn('public_order_detail_invalid_order_id', {
        ...baseMeta,
        code: 'INVALID_ORDER_ID',
        issuesCount: parsed.error.issues?.length ?? 0,
        durationMs: Date.now() - startedAtMs,
      });

      return noStoreJson(
        { code: 'INVALID_ORDER_ID', error: 'Invalid order id' },
        { status: 400 }
      );
    }

    orderIdForLog = parsed.data.id;

    const isAdmin = user.role === 'admin';

    const whereClause = isAdmin
      ? eq(orders.id, orderIdForLog)
      : and(eq(orders.id, orderIdForLog), eq(orders.userId, user.id));

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
      .where(whereClause);

    if (rows.length === 0) {
      logWarn('public_order_detail_not_found', {
        ...baseMeta,
        code: 'ORDER_NOT_FOUND',
        orderId: orderIdForLog,
        isAdmin,
        durationMs: Date.now() - startedAtMs,
      });

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
    logError('public_order_detail_failed', error, {
      ...baseMeta,
      orderId: orderIdForLog,
      code: 'PUBLIC_ORDER_DETAIL_FAILED',
      durationMs: Date.now() - startedAtMs,
    });

    return noStoreJson(
      { code: 'INTERNAL_ERROR', error: 'internal_error' },
      { status: 500 }
    );
  }
}
