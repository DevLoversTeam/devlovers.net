import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { orders } from '@/db/schema';
import {
  AdminApiDisabledError,
  AdminForbiddenError,
  AdminUnauthorizedError,
  requireAdminApi,
} from '@/lib/auth/admin';
import { getMonobankConfig } from '@/lib/env/monobank';
import { readPositiveIntEnv } from '@/lib/env/readPositiveIntEnv';
import { logError, logWarn } from '@/lib/logging';
import { requireAdminCsrf } from '@/lib/security/admin-csrf';
import { guardBrowserSameOrigin } from '@/lib/security/origin';
import {
  enforceRateLimit,
  getRateLimitSubject,
  normalizeRateLimitSubject,
  rateLimitResponse,
} from '@/lib/security/rate-limit';
import {
  InvalidPayloadError,
  OrderNotFoundError,
  PspUnavailableError,
} from '@/lib/services/errors';
import { refundOrder } from '@/lib/services/orders';
import { orderIdParamSchema, orderSummarySchema } from '@/lib/validation/shop';

function noStoreJson(body: unknown, init?: { status?: number }) {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

const DEFAULT_ADMIN_REFUND_RATE_LIMIT_MAX = 5;
const DEFAULT_ADMIN_REFUND_RATE_LIMIT_WINDOW_SECONDS = 60;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startedAtMs = Date.now();

  const requestId =
    request.headers.get('x-request-id')?.trim() || crypto.randomUUID();

  const blocked = guardBrowserSameOrigin(request);
  if (blocked) {
    logWarn('admin_orders_refund_origin_blocked', {
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
    const adminUser = await requireAdminApi(request);
    const csrfRes = requireAdminCsrf(request, 'admin:orders:refund');
    if (csrfRes) {
      logWarn('admin_orders_refund_csrf_rejected', {
        ...baseMeta,
        code: 'CSRF_REJECTED',
        orderId: orderIdForLog,
        durationMs: Date.now() - startedAtMs,
      });

      csrfRes.headers.set('Cache-Control', 'no-store');
      return csrfRes;
    }
    const adminId =
      adminUser && typeof adminUser === 'object'
        ? (adminUser as Record<string, unknown>).id
        : undefined;

    const adminSubject =
      typeof adminId === 'string'
        ? `admin_${normalizeRateLimitSubject(adminId)}`
        : getRateLimitSubject(request);

    const limit = readPositiveIntEnv(
      'ADMIN_REFUND_RATE_LIMIT_MAX',
      DEFAULT_ADMIN_REFUND_RATE_LIMIT_MAX
    );
    const windowSeconds = readPositiveIntEnv(
      'ADMIN_REFUND_RATE_LIMIT_WINDOW_SECONDS',
      DEFAULT_ADMIN_REFUND_RATE_LIMIT_WINDOW_SECONDS
    );

    const decision = await enforceRateLimit({
      key: `admin_refund:${adminSubject}`,
      limit,
      windowSeconds,
    });

    if (!decision.ok) {
      logWarn('admin_orders_refund_rate_limited', {
        ...baseMeta,
        code: 'RATE_LIMITED',
        orderId: orderIdForLog,
        retryAfterSeconds: decision.retryAfterSeconds,
        durationMs: Date.now() - startedAtMs,
      });

      return rateLimitResponse({
        retryAfterSeconds: decision.retryAfterSeconds,
        details: { scope: 'admin_refund' },
      });
    }

    const rawParams = await context.params;
    const parsed = orderIdParamSchema.safeParse(rawParams);

    if (!parsed.success) {
      logWarn('admin_orders_refund_invalid_order_id', {
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
    const [targetOrder] = await db
      .select({ paymentProvider: orders.paymentProvider })
      .from(orders)
      .where(eq(orders.id, orderIdForLog))
      .limit(1);

    if (targetOrder?.paymentProvider === 'monobank') {
      const { refundEnabled } = getMonobankConfig();
      if (!refundEnabled) {
        logWarn('admin_orders_refund_disabled', {
          ...baseMeta,
          code: 'REFUND_DISABLED',
          orderId: orderIdForLog,
          durationMs: Date.now() - startedAtMs,
        });

        return noStoreJson(
          { code: 'REFUND_DISABLED', message: 'Refunds are disabled.' },
          { status: 409 }
        );
      }

      const { requestMonobankFullRefund } =
        await import('@/lib/services/orders/monobank-refund');
      const result = await requestMonobankFullRefund({
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
        refund: {
          ...result.refund,
          deduped: result.deduped,
        },
      });
    }

    const order = await refundOrder(orderIdForLog, { requestedBy: 'admin' });

    const orderSummary = orderSummarySchema.parse(order);

    return noStoreJson({
      success: true,
      order: {
        ...orderSummary,
        createdAt:
          orderSummary.createdAt instanceof Date
            ? orderSummary.createdAt.toISOString()
            : String(orderSummary.createdAt),
      },
    });
  } catch (error) {
    if (error instanceof AdminApiDisabledError) {
      logWarn('admin_orders_refund_admin_api_disabled', {
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
      logWarn('admin_orders_refund_unauthorized', {
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
      logWarn('admin_orders_refund_forbidden', {
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
      logWarn('admin_orders_refund_not_found', {
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
      logWarn('admin_orders_refund_invalid_payload', {
        ...baseMeta,
        code: error.code,
        orderId: orderIdForLog,
        durationMs: Date.now() - startedAtMs,
      });

      return noStoreJson(
        { code: error.code, message: error.message },
        { status: 400 }
      );
    }

    if (error instanceof PspUnavailableError) {
      logWarn('admin_orders_refund_psp_unavailable', {
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

    logError('admin_orders_refund_failed', error, {
      ...baseMeta,
      orderId: orderIdForLog,
      code: 'ADMIN_REFUND_FAILED',
      durationMs: Date.now() - startedAtMs,
    });

    return noStoreJson(
      { code: 'INTERNAL_ERROR', message: 'Unable to refund order.' },
      { status: 500 }
    );
  }
}
