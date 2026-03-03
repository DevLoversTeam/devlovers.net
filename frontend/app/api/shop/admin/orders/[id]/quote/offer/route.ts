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
import { InvalidPayloadError, OrderNotFoundError } from '@/lib/services/errors';
import { offerIntlQuote } from '@/lib/services/shop/quotes';
import {
  intlQuoteOfferPayloadSchema,
  orderIdParamSchema,
} from '@/lib/validation/shop';

function noStoreJson(body: unknown, init?: { status?: number }) {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

function mapQuoteErrorStatus(code: string): number {
  if (
    code === 'QUOTE_VERSION_CONFLICT' ||
    code === 'QUOTE_NOT_APPLICABLE' ||
    code === 'QUOTE_ALREADY_ACCEPTED'
  ) {
    return 409;
  }
  if (code === 'QUOTE_INVALID_EXPIRY') return 422;
  return 400;
}

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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
    blocked.headers.set('Cache-Control', 'no-store');
    return blocked;
  }

  try {
    const admin = await requireAdminApi(request);
    const csrfRes = requireAdminCsrf(request, 'admin:orders:quote:offer');
    if (csrfRes) {
      csrfRes.headers.set('Cache-Control', 'no-store');
      return csrfRes;
    }

    const parsedParams = orderIdParamSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return noStoreJson(
        { code: 'INVALID_ORDER_ID', message: 'Invalid order id.' },
        { status: 400 }
      );
    }
    orderIdForLog = parsedParams.data.id;

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return noStoreJson(
        { code: 'INVALID_PAYLOAD', message: 'Invalid JSON body.' },
        { status: 400 }
      );
    }

    const parsedBody = intlQuoteOfferPayloadSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return noStoreJson(
        { code: 'INVALID_PAYLOAD', message: 'Invalid payload.' },
        { status: 400 }
      );
    }

    const payload = parsedBody.data;
    const result = await offerIntlQuote({
      orderId: orderIdForLog,
      requestId,
      actorUserId: typeof admin.id === 'string' ? admin.id : null,
      version: payload.version,
      currency: payload.currency,
      shippingQuoteMinor: payload.shippingQuoteMinor,
      expiresAt: payload.expiresAt ?? null,
      payload: payload.payload,
    });

    return noStoreJson(
      {
        success: true,
        orderId: result.orderId,
        version: result.version,
        quoteStatus: result.quoteStatus,
        shippingQuoteMinor: result.shippingQuoteMinor,
        currency: result.currency,
        expiresAt: result.expiresAt.toISOString(),
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
      return noStoreJson(
        { code: error.code, message: 'Unauthorized.' },
        { status: 401 }
      );
    }
    if (error instanceof AdminForbiddenError) {
      return noStoreJson(
        { code: error.code, message: 'Forbidden.' },
        { status: 403 }
      );
    }
    if (error instanceof OrderNotFoundError) {
      return noStoreJson({ code: error.code }, { status: 404 });
    }
    if (error instanceof InvalidPayloadError) {
      logWarn('admin_quote_offer_rejected', {
        ...baseMeta,
        orderId: orderIdForLog,
        code: error.code,
      });
      return noStoreJson(
        {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
        { status: mapQuoteErrorStatus(error.code) }
      );
    }

    logError('admin_quote_offer_failed', error, {
      ...baseMeta,
      orderId: orderIdForLog,
      code: 'ADMIN_QUOTE_OFFER_FAILED',
    });
    return noStoreJson(
      { code: 'INTERNAL_ERROR', message: 'Unable to offer quote.' },
      { status: 500 }
    );
  }
}
