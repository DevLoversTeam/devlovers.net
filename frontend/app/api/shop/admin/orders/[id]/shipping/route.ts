import crypto from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

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
  applyShippingAdminAction,
  ShippingAdminActionError,
} from '@/lib/services/shop/shipping/admin-actions';
import {
  sanitizeShippingErrorForLog,
  sanitizeShippingLogMeta,
} from '@/lib/services/shop/shipping/log-sanitizer';
import { orderIdParamSchema } from '@/lib/validation/shop';

export const runtime = 'nodejs';

const payloadSchema = z
  .object({
    action: z.enum(['retry_label_creation', 'mark_shipped', 'mark_delivered']),
  })
  .strict();

function noStoreJson(body: unknown, init?: { status?: number }) {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export async function POST(
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

  const blocked = guardBrowserSameOrigin(request);
  if (blocked) {
    logWarn('admin_orders_shipping_action_origin_blocked', {
      ...baseMeta,
      code: 'ORIGIN_BLOCKED',
      durationMs: Date.now() - startedAtMs,
    });
    blocked.headers.set('Cache-Control', 'no-store');
    return blocked;
  }

  try {
    const adminUser = await requireAdminApi(request);
    const csrfRes = requireAdminCsrf(request, 'admin:orders:shipping:action');
    if (csrfRes) {
      logWarn('admin_orders_shipping_action_csrf_rejected', {
        ...baseMeta,
        code: 'CSRF_REJECTED',
        durationMs: Date.now() - startedAtMs,
      });
      csrfRes.headers.set('Cache-Control', 'no-store');
      return csrfRes;
    }

    const parsedParams = orderIdParamSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return noStoreJson(
        {
          code: 'INVALID_ORDER_ID',
          message: 'Invalid order id.',
        },
        { status: 400 }
      );
    }

    orderIdForLog = parsedParams.data.id;

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return noStoreJson(
        {
          code: 'INVALID_PAYLOAD',
          message: 'Invalid JSON body.',
        },
        { status: 400 }
      );
    }

    const parsedPayload = payloadSchema.safeParse(rawBody);
    if (!parsedPayload.success) {
      return noStoreJson(
        {
          code: 'INVALID_PAYLOAD',
          message: 'Invalid payload.',
        },
        { status: 400 }
      );
    }

    const result = await applyShippingAdminAction({
      orderId: orderIdForLog,
      action: parsedPayload.data.action,
      actorUserId:
        typeof adminUser?.id === 'string' && adminUser.id.trim().length > 0
          ? adminUser.id
          : null,
      requestId,
    });

    return noStoreJson(
      {
        success: true,
        action: result.action,
        changed: result.changed,
        order: {
          id: result.orderId,
          shippingStatus: result.shippingStatus,
          trackingNumber: result.trackingNumber,
          shipmentStatus: result.shipmentStatus,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AdminApiDisabledError) {
      return noStoreJson(
        { code: 'ADMIN_API_DISABLED', message: 'Admin API is disabled.' },
        { status: 403 }
      );
    }

    if (error instanceof AdminUnauthorizedError) {
      return noStoreJson({ code: error.code, message: 'Unauthorized.' }, { status: 401 });
    }

    if (error instanceof AdminForbiddenError) {
      return noStoreJson({ code: error.code, message: 'Forbidden.' }, { status: 403 });
    }

    if (error instanceof ShippingAdminActionError) {
      logWarn('admin_orders_shipping_action_rejected', {
        ...baseMeta,
        orderId: orderIdForLog,
        code: error.code,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson(
        {
          code: error.code,
          message: error.message,
        },
        { status: error.status }
      );
    }

    logError(
      'admin_orders_shipping_action_failed',
      sanitizeShippingErrorForLog(error, 'Admin shipping action failed.'),
      sanitizeShippingLogMeta({
        ...baseMeta,
        orderId: orderIdForLog,
        code: 'ADMIN_SHIPPING_ACTION_FAILED',
        durationMs: Date.now() - startedAtMs,
      })
    );

    return noStoreJson(
      {
        code: 'INTERNAL_ERROR',
        message: 'Unable to process shipping action.',
      },
      { status: 500 }
    );
  }
}
