import crypto from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { logError, logWarn } from '@/lib/logging';
import {
  InvalidPayloadError,
  OrderNotFoundError,
} from '@/lib/services/errors';
import { authorizeOrderMutationAccess } from '@/lib/services/shop/order-access';
import { requestIntlQuote } from '@/lib/services/shop/quotes';
import { guardBrowserSameOrigin } from '@/lib/security/origin';
import { orderIdParamSchema } from '@/lib/validation/shop';

function noStoreJson(body: unknown, init?: { status?: number }) {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

function mapQuoteErrorStatus(code: string): number {
  if (
    code === 'QUOTE_NOT_APPLICABLE' ||
    code === 'QUOTE_ALREADY_ACCEPTED' ||
    code === 'QUOTE_NOT_OFFERED'
  ) {
    return 409;
  }
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
    const result = await requestIntlQuote({
      orderId,
      requestId,
      actorUserId: auth.actorUserId,
    });

    return noStoreJson(
      {
        success: true,
        orderId: result.orderId,
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
      logWarn('quote_request_rejected', {
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

    logError('quote_request_failed', error, {
      ...baseMeta,
      orderId,
      code: 'QUOTE_REQUEST_FAILED',
    });

    return noStoreJson(
      { code: 'INTERNAL_ERROR', message: 'Unable to request quote.' },
      { status: 500 }
    );
  }
}
