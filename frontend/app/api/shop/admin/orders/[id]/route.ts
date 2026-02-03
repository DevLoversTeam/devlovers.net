import crypto from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { getAdminOrderDetail } from '@/db/queries/shop/admin-orders';
import {
  AdminApiDisabledError,
  AdminForbiddenError,
  AdminUnauthorizedError,
  requireAdminApi,
} from '@/lib/auth/admin';
import { logError, logWarn } from '@/lib/logging';
import { orderIdParamSchema } from '@/lib/validation/shop';

export const runtime = 'nodejs';

function noStoreJson(body: unknown, init?: { status?: number }) {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
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
    await requireAdminApi(request);

    const rawParams = await context.params;
    const parsed = orderIdParamSchema.safeParse(rawParams);

    if (!parsed.success) {
      logWarn('admin_order_detail_invalid_order_id', {
        ...baseMeta,
        code: 'INVALID_ORDER_ID',
        issuesCount: parsed.error.issues?.length ?? 0,
        durationMs: Date.now() - startedAtMs,
      });

      return noStoreJson(
        { code: 'INVALID_ORDER_ID', message: 'Invalid order id.' },
        { status: 400 }
      );
    }

    orderIdForLog = parsed.data.id;

    const order = await getAdminOrderDetail(orderIdForLog);

    if (!order) {
      logWarn('admin_order_detail_not_found', {
        ...baseMeta,
        code: 'ORDER_NOT_FOUND',
        orderId: orderIdForLog,
        durationMs: Date.now() - startedAtMs,
      });

      return noStoreJson(
        { code: 'ORDER_NOT_FOUND', message: 'Order not found.' },
        { status: 404 }
      );
    }

    return noStoreJson(
      {
        success: true,
        order: {
          ...order,
          createdAt: order.createdAt.toISOString(),
          updatedAt: order.updatedAt.toISOString(),
          restockedAt: order.restockedAt
            ? order.restockedAt.toISOString()
            : null,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AdminApiDisabledError) {
      logWarn('admin_order_detail_admin_api_disabled', {
        ...baseMeta,
        code: error.code,
        orderId: orderIdForLog,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson(
        { code: error.code, message: 'Admin API is disabled.' },
        { status: 403 }
      );
    }

    if (error instanceof AdminUnauthorizedError) {
      logWarn('admin_order_detail_unauthorized', {
        ...baseMeta,
        code: error.code,
        orderId: orderIdForLog,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson(
        { code: error.code, message: 'Unauthorized.' },
        { status: 401 }
      );
    }

    if (error instanceof AdminForbiddenError) {
      logWarn('admin_order_detail_forbidden', {
        ...baseMeta,
        code: error.code,
        orderId: orderIdForLog,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson(
        { code: error.code, message: 'Forbidden.' },
        { status: 403 }
      );
    }

    logError('admin_order_detail_failed', error, {
      ...baseMeta,
      orderId: orderIdForLog,
      code: 'ADMIN_ORDER_DETAIL_FAILED',
      durationMs: Date.now() - startedAtMs,
    });

    return noStoreJson(
      { code: 'INTERNAL_ERROR', message: 'Internal error.' },
      { status: 500 }
    );
  }
}
