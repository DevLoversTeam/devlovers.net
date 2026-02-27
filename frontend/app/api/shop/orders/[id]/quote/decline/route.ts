import crypto from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { logError, logWarn } from '@/lib/logging';
import {
  InvalidPayloadError,
  OrderNotFoundError,
} from '@/lib/services/errors';
import { authorizeOrderMutationAccess } from '@/lib/services/shop/order-access';
import { declineIntlQuote } from '@/lib/services/shop/quotes';
import { guardBrowserSameOrigin } from '@/lib/security/origin';
import {
  intlQuoteDeclinePayloadSchema,
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
    code === 'QUOTE_NOT_OFFERED' ||
    code === 'QUOTE_ALREADY_ACCEPTED'
  ) {
    return 409;
  }
  if (code === 'QUOTE_EXPIRED') return 410;
  return 400;
}

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

  const blocked = guardBrowserSameOrigin(request);
  if (blocked) return blocked;

  const parsedParams = orderIdParamSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return noStoreJson(
      { code: 'INVALID_ORDER_ID', message: 'Invalid order id.' },
      { status: 400 }
    );
  }

  let rawBody: unknown = {};
  try {
    const raw = await request.text();
    if (raw.trim()) {
      rawBody = JSON.parse(raw);
    }
  } catch {
    return noStoreJson(
      { code: 'INVALID_PAYLOAD', message: 'Invalid JSON body.' },
      { status: 400 }
    );
  }

  const parsedBody = intlQuoteDeclinePayloadSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return noStoreJson(
      { code: 'INVALID_PAYLOAD', message: 'Invalid payload.' },
      { status: 400 }
    );
  }

  const orderId = parsedParams.data.id;
  const statusToken = request.nextUrl.searchParams.get('statusToken');
  const auth = await authorizeOrderMutationAccess({
    orderId,
    statusToken,
  });
  if (!auth.authorized) {
    return noStoreJson({ code: auth.code }, { status: auth.status });
  }

  try {
    const result = await declineIntlQuote({
      orderId,
      requestId,
      actorUserId: auth.actorUserId,
      version: parsedBody.data.version ?? null,
    });

    return noStoreJson(
      {
        success: true,
        orderId: result.orderId,
        version: result.version ?? null,
        quoteStatus: result.quoteStatus,
        changed: result.changed,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return noStoreJson({ code: error.code }, { status: 404 });
    }

    if (error instanceof InvalidPayloadError) {
      logWarn('quote_decline_rejected', {
        ...baseMeta,
        orderId,
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

    logError('quote_decline_failed', error, {
      ...baseMeta,
      orderId,
      code: 'QUOTE_DECLINE_FAILED',
    });

    return noStoreJson(
      { code: 'INTERNAL_ERROR', message: 'Unable to decline quote.' },
      { status: 500 }
    );
  }
}
