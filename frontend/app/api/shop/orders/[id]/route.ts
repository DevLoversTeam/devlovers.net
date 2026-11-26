import 'server-only';

import { and, eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';

import { db } from '@/db';
import {
  type CustomerOrderItem,
  customerOrderItemProjection,
  toCustomerOrderItem,
} from '@/db/queries/shop/order-item-snapshot';
import { orderItems, orders } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { getRequestId } from '@/lib/http/getRequestId';
import { noStoreJson } from '@/lib/http/noStoreJson';
import { logError, logWarn } from '@/lib/logging';
import {
  type CanonicalFulfillmentStage,
  deriveCanonicalFulfillmentStage,
  latestReturnStatusSql,
  latestShipmentStatusSql,
} from '@/lib/services/shop/fulfillment-stage';
import { orderIdParamSchema } from '@/lib/validation/shop';

export const dynamic = 'force-dynamic';

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
  fulfillmentStage: CanonicalFulfillmentStage;
  shippingStatus: string | null;
  trackingNumber: string | null;
  stockRestored: boolean;
  restockedAt: string | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  items: CustomerOrderItem[];
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startedAtMs = Date.now();

  const requestId = getRequestId(request.headers);

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
          orderStatus: orders.status,
          shippingStatus: orders.shippingStatus,
          shipmentStatus: latestShipmentStatusSql(orders.id),
          returnStatus: latestReturnStatusSql(orders.id),
          trackingNumber: orders.trackingNumber,
          stockRestored: orders.stockRestored,
          restockedAt: orders.restockedAt,
          idempotencyKey: orders.idempotencyKey,
          createdAt: orders.createdAt,
          updatedAt: orders.updatedAt,
        },
        item: customerOrderItemProjection,
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
    const fulfillmentStage = deriveCanonicalFulfillmentStage({
      orderStatus: base.orderStatus,
      shippingStatus: base.shippingStatus,
      shipmentStatus:
        typeof base.shipmentStatus === 'string' ? base.shipmentStatus : null,
      returnStatus:
        typeof base.returnStatus === 'string' ? base.returnStatus : null,
    });

    const items = rows
      .map(r => toCustomerOrderItem(r.item))
      .filter((i): i is NonNullable<typeof i> => i !== null);

    const response: OrderDetailResponse = {
      id: base.id,
      userId: base.userId,
      totalAmount: base.totalAmount,
      currency: base.currency,
      paymentStatus: base.paymentStatus,
      paymentProvider: base.paymentProvider,
      paymentIntentId: base.paymentIntentId,
      fulfillmentStage,
      shippingStatus: base.shippingStatus,
      trackingNumber: base.trackingNumber,
      stockRestored: base.stockRestored,
      idempotencyKey: base.idempotencyKey,
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
