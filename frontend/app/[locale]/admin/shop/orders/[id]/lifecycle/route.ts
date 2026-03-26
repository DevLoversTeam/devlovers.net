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
  AdminOrderLifecycleActionError,
  applyAdminOrderLifecycleAction,
} from '@/lib/services/shop/admin-order-lifecycle';
import { orderIdParamSchema } from '@/lib/validation/shop';

export const runtime = 'nodejs';

const payloadSchema = z
  .object({
    action: z.enum(['confirm', 'cancel', 'complete']),
  })
  .strict();

function buildDetailUrl(args: {
  request: NextRequest;
  locale: string;
  orderId: string;
  errorCode?: string | null;
}): URL {
  const url = new URL(
    `/${args.locale}/admin/shop/orders/${args.orderId}`,
    args.request.url
  );
  if (args.errorCode) {
    url.searchParams.set('lifecycleError', args.errorCode);
  } else {
    url.searchParams.delete('lifecycleError');
  }
  return url;
}

function redirectToDetail(args: {
  request: NextRequest;
  locale: string;
  orderId: string;
  errorCode?: string | null;
}) {
  return NextResponse.redirect(buildDetailUrl(args), { status: 303 });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ locale: string; id: string }> }
) {
  const startedAtMs = Date.now();
  const requestId =
    request.headers.get('x-request-id')?.trim() || crypto.randomUUID();
  const baseMeta = {
    requestId,
    route: request.nextUrl.pathname,
    method: request.method,
  };

  let localeForRedirect = 'en';
  let orderIdForLog: string | null = null;

  const blocked = guardBrowserSameOrigin(request);
  if (blocked) {
    logWarn('admin_orders_lifecycle_origin_blocked', {
      ...baseMeta,
      code: 'ORIGIN_BLOCKED',
      durationMs: Date.now() - startedAtMs,
    });
    return blocked;
  }

  try {
    const rawParams = await context.params;
    localeForRedirect =
      typeof rawParams.locale === 'string' && rawParams.locale.trim().length > 0
        ? rawParams.locale
        : 'en';

    const parsed = orderIdParamSchema.safeParse({ id: rawParams.id });
    if (!parsed.success) {
      return NextResponse.json(
        { code: 'INVALID_ORDER_ID', message: 'Invalid order id.' },
        { status: 400 }
      );
    }
    orderIdForLog = parsed.data.id;

    const adminUser = await requireAdminApi(request);
    const formData = await request.formData();
    const csrfRes = requireAdminCsrf(
      request,
      'admin:orders:lifecycle',
      formData
    );
    if (csrfRes) {
      logWarn('admin_orders_lifecycle_csrf_rejected', {
        ...baseMeta,
        orderId: orderIdForLog,
        code: 'CSRF_REJECTED',
        durationMs: Date.now() - startedAtMs,
      });
      return redirectToDetail({
        request,
        locale: localeForRedirect,
        orderId: orderIdForLog,
        errorCode: 'CSRF_REJECTED',
      });
    }

    const parsedPayload = payloadSchema.safeParse({
      action: formData.get('action'),
    });
    if (!parsedPayload.success) {
      logWarn('admin_orders_lifecycle_invalid_payload', {
        ...baseMeta,
        orderId: orderIdForLog,
        code: 'INVALID_PAYLOAD',
        durationMs: Date.now() - startedAtMs,
      });
      return redirectToDetail({
        request,
        locale: localeForRedirect,
        orderId: orderIdForLog,
        errorCode: 'INVALID_PAYLOAD',
      });
    }

    await applyAdminOrderLifecycleAction({
      orderId: orderIdForLog,
      action: parsedPayload.data.action,
      actorUserId:
        typeof adminUser.id === 'string' && adminUser.id.trim().length > 0
          ? adminUser.id
          : null,
      requestId,
    });

    return redirectToDetail({
      request,
      locale: localeForRedirect,
      orderId: orderIdForLog,
    });
  } catch (error) {
    if (error instanceof AdminApiDisabledError) {
      return NextResponse.json(
        { code: 'ADMIN_API_DISABLED', message: 'Admin API is disabled.' },
        { status: 403 }
      );
    }

    if (error instanceof AdminUnauthorizedError) {
      return NextResponse.json(
        { code: error.code, message: 'Unauthorized.' },
        { status: 401 }
      );
    }

    if (error instanceof AdminForbiddenError) {
      return NextResponse.json(
        { code: error.code, message: 'Forbidden.' },
        { status: 403 }
      );
    }

    if (error instanceof AdminOrderLifecycleActionError) {
      logWarn('admin_orders_lifecycle_rejected', {
        ...baseMeta,
        orderId: orderIdForLog,
        code: error.code,
        durationMs: Date.now() - startedAtMs,
      });
      return redirectToDetail({
        request,
        locale: localeForRedirect,
        orderId: orderIdForLog ?? '',
        errorCode: error.code,
      });
    }

    logError('admin_orders_lifecycle_failed', error, {
      ...baseMeta,
      orderId: orderIdForLog,
      code: 'ADMIN_ORDER_LIFECYCLE_FAILED',
      durationMs: Date.now() - startedAtMs,
    });

    return redirectToDetail({
      request,
      locale: localeForRedirect,
      orderId: orderIdForLog ?? '',
      errorCode: 'INTERNAL_ERROR',
    });
  }
}
