import crypto from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import {
  AdminApiDisabledError,
  AdminForbiddenError,
  AdminUnauthorizedError,
  requireAdminApi,
} from '@/lib/auth/admin';
import { logError, logWarn } from '@/lib/logging';
import { requireAdminCsrf } from '@/lib/security/admin-csrf';
import { guardBrowserSameOrigin } from '@/lib/security/origin';
import {
  InvalidPayloadError,
  OrderNotFoundError,
  PspUnavailableError,
} from '@/lib/services/errors';
import { cancelMonobankUnpaidPayment } from '@/lib/services/orders/monobank-cancel-payment';
import { orderIdParamSchema, orderSummarySchema } from '@/lib/validation/shop';

function noStoreJson(body: unknown, init?: { status?: number }) {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

function invalidPayloadStatus(error: InvalidPayloadError): number {
  if (
    error.code === 'CANCEL_PROVIDER_NOT_MONOBANK' ||
    error.code === 'CANCEL_NOT_ALLOWED' ||
    error.code === 'CANCEL_DISABLED' ||
    error.code === 'CANCEL_MISSING_PROVIDER_REF' ||
    error.code === 'CANCEL_IN_PROGRESS'
  ) {
    return 409;
  }

  return 400;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startedAtMs = Date.now();
  const requestId =
    request.headers.get('x-request-id')?.trim() || crypto.randomUUID();

  const blocked = guardBrowserSameOrigin(request);
  if (blocked) {
    logWarn('admin_orders_cancel_payment_origin_blocked', {
      requestId,
      route: request.nextUrl.pathname,
      method: request.method,
      code: 'ORIGIN_BLOCKED',
      durationMs: Date.now() - startedAtMs,
    });
    blocked.headers.set('Cache-Control', 'no-store');
    return blocked;
  }

  const baseMeta = {
    requestId,
    route: request.nextUrl.pathname,
    method: request.method,
  };

  let orderIdForLog: string | null = null;

  try {
    await requireAdminApi(request);

    const csrfRes = requireAdminCsrf(request, 'admin:orders:cancel-payment');
    if (csrfRes) {
      logWarn('admin_orders_cancel_payment_csrf_rejected', {
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
      logWarn('admin_orders_cancel_payment_invalid_order_id', {
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
    const result = await cancelMonobankUnpaidPayment({
      orderId: orderIdForLog,
      requestId,
    });

    const orderSummary = orderSummarySchema.parse(result.order);

    return noStoreJson({
      success: true,
      order: {
        ...orderSummary,
        createdAt:
          orderSummary.createdAt instanceof Date
            ? orderSummary.createdAt.toISOString()
            : String(orderSummary.createdAt),
      },
      cancel: {
        ...result.cancel,
      },
      deduped: result.cancel.deduped,
    });
  } catch (error) {
    if (error instanceof AdminApiDisabledError) {
      logWarn('admin_orders_cancel_payment_admin_api_disabled', {
        ...baseMeta,
        code: 'ADMIN_API_DISABLED',
        orderId: orderIdForLog,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson(
        { code: 'ADMIN_API_DISABLED', message: 'Admin API is disabled.' },
        { status: 403 }
      );
    }

    if (error instanceof AdminUnauthorizedError) {
      logWarn('admin_orders_cancel_payment_unauthorized', {
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
      logWarn('admin_orders_cancel_payment_forbidden', {
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

    if (error instanceof OrderNotFoundError) {
      logWarn('admin_orders_cancel_payment_not_found', {
        ...baseMeta,
        code: error.code,
        orderId: orderIdForLog,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson(
        { code: error.code, message: error.message },
        { status: 404 }
      );
    }

    if (error instanceof InvalidPayloadError) {
      logWarn('admin_orders_cancel_payment_invalid_payload', {
        ...baseMeta,
        code: error.code,
        orderId: orderIdForLog,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson(
        { code: error.code, message: error.message },
        { status: invalidPayloadStatus(error) }
      );
    }

    if (error instanceof PspUnavailableError) {
      logWarn('admin_orders_cancel_payment_psp_unavailable', {
        ...baseMeta,
        code: 'PSP_UNAVAILABLE',
        orderId: orderIdForLog,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson(
        { code: 'PSP_UNAVAILABLE', message: 'Payment provider unavailable.' },
        { status: 503 }
      );
    }

    logError('admin_orders_cancel_payment_failed', error, {
      ...baseMeta,
      code: 'ADMIN_CANCEL_PAYMENT_FAILED',
      orderId: orderIdForLog,
      durationMs: Date.now() - startedAtMs,
    });

    return noStoreJson(
      { code: 'INTERNAL_ERROR', message: 'Unable to cancel payment.' },
      { status: 500 }
    );
  }
}
