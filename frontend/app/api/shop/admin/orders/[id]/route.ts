import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import {
  AdminApiDisabledError,
  AdminForbiddenError,
  AdminUnauthorizedError,
  requireAdminApi,
} from '@/lib/auth/admin';
import { requireAdminCsrf } from '@/lib/security/admin-csrf';

import { getAdminOrderDetail } from '@/db/queries/shop/admin-orders';

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

  // Origin posture: same-origin enforcement is applied to mutating methods;
  // GET is intentionally unguarded.

  const baseMeta = {
    requestId,
    route: request.nextUrl.pathname,
    method: request.method,
  };

  let orderIdForLog: string | null = null;

  try {
    await requireAdminApi(request);

    const csrfRes = requireAdminCsrf(request, 'admin:orders:read');
    if (csrfRes) {
      logWarn('admin_order_detail_csrf_rejected', {
        ...baseMeta,
        code: 'CSRF_REJECTED',
        orderId: orderIdForLog,
        durationMs: Date.now() - startedAtMs,
      });
      csrfRes.headers.set('Cache-Control', 'no-store');
      return csrfRes;
    }

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
        { error: 'Invalid order id', code: 'INVALID_ORDER_ID' },
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
        { error: 'Order not found', code: 'ORDER_NOT_FOUND' },
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
      return noStoreJson({ code: error.code }, { status: 403 });
    }

    if (error instanceof AdminUnauthorizedError) {
      logWarn('admin_order_detail_unauthorized', {
        ...baseMeta,
        code: error.code,
        orderId: orderIdForLog,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson({ code: error.code }, { status: 401 });
    }

    if (error instanceof AdminForbiddenError) {
      logWarn('admin_order_detail_forbidden', {
        ...baseMeta,
        code: error.code,
        orderId: orderIdForLog,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson({ code: error.code }, { status: 403 });
    }

    logError('admin_order_detail_failed', error, {
      ...baseMeta,
      orderId: orderIdForLog,
      code: 'ADMIN_ORDER_DETAIL_FAILED',
      durationMs: Date.now() - startedAtMs,
    });

    return noStoreJson(
      { error: 'internal_error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
