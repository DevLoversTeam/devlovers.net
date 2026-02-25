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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function maskName(value: string | null): string | null {
  if (!value) return null;
  const v = value.trim();
  if (v.length <= 2) return `${v[0] ?? '*'}*`;
  return `${v.slice(0, 1)}***${v.slice(-1)}`;
}

function maskPhone(value: string | null): string | null {
  if (!value) return null;
  const v = value.trim();
  if (v.startsWith('+380') && v.length >= 13) {
    return `${v.slice(0, 4)}******${v.slice(-3)}`;
  }
  if (v.length <= 4) return '**';
  return `${v.slice(0, 2)}***${v.slice(-2)}`;
}

function maskEmail(value: string | null): string | null {
  if (!value) return null;
  const v = value.trim();
  const at = v.indexOf('@');
  if (at <= 1) return '***';
  return `${v.slice(0, 1)}***${v.slice(at - 1)}`;
}

function maskAddress(value: string | null): string | null {
  if (!value) return null;
  const v = value.trim();
  if (v.length <= 6) return `${v.slice(0, 1)}***`;
  return `${v.slice(0, 6)}***`;
}

function maskShippingAddress(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) return null;
  const selection = isRecord(raw.selection) ? raw.selection : {};
  const recipient = isRecord(raw.recipient) ? raw.recipient : {};

  return {
    provider: toStringOrNull(raw.provider),
    methodCode: toStringOrNull(raw.methodCode),
    selection: {
      cityRef: toStringOrNull(selection.cityRef),
      cityNameUa: toStringOrNull(selection.cityNameUa),
      cityNameRu: toStringOrNull(selection.cityNameRu),
      warehouseRef: toStringOrNull(selection.warehouseRef),
      warehouseName: toStringOrNull(selection.warehouseName),
      addressLine1: maskAddress(toStringOrNull(selection.addressLine1)),
      addressLine2: maskAddress(toStringOrNull(selection.addressLine2)),
    },
    recipient: {
      fullName: maskName(toStringOrNull(recipient.fullName)),
      phone: maskPhone(toStringOrNull(recipient.phone)),
      email: maskEmail(toStringOrNull(recipient.email)),
    },
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
          shippingAddress: maskShippingAddress(order.shippingAddress),
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
