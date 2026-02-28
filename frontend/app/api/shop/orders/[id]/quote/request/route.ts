import crypto from 'node:crypto';

import { NextRequest } from 'next/server';

import { logError, logWarn } from '@/lib/logging';
import { guardBrowserSameOrigin } from '@/lib/security/origin';
import {
  InvalidPayloadError,
  OrderNotFoundError,
} from '@/lib/services/errors';
import { authorizeOrderMutationAccess } from '@/lib/services/shop/order-access';
import { requestIntlQuote } from '@/lib/services/shop/quotes';
import { orderIdParamSchema } from '@/lib/validation/shop';

import { mapQuoteErrorStatus, noStoreJson } from '../quote-utils';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const raw = request.headers.get('x-request-id');
  const candidateRequestId = raw?.trim() ?? '';
  const requestId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    candidateRequestId
  )
    ? candidateRequestId
    : crypto.randomUUID();
  const baseMeta = {
    requestId,
    route: request.nextUrl.pathname,
    method: request.method,
  };

  const blocked = guardBrowserSameOrigin(request);
  if (blocked) {
    blocked.headers.set('Cache-Control', 'no-store');
    return blocked;
  }

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
    requiredScope: 'order_quote_request',
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
      const detailsKeys =
        error.details &&
        typeof error.details === 'object' &&
        !Array.isArray(error.details)
          ? Object.keys(error.details as Record<string, unknown>).slice(0, 20)
          : null;

      logWarn('quote_request_rejected', {
        ...baseMeta,
        orderId,
        action: 'order_quote_request',
        code: error.code,
        ...(detailsKeys ? { detailsKeys } : {}),
      });

      return noStoreJson(
        {
          code: error.code,
          message: error.message,
        },
        { status: mapQuoteErrorStatus(error.code, 'request') }
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
