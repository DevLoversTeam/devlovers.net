import crypto from 'node:crypto';

import { NextRequest } from 'next/server';

import { logError, logWarn } from '@/lib/logging';
import { guardBrowserSameOrigin } from '@/lib/security/origin';
import {
  InvalidPayloadError,
  OrderNotFoundError,
} from '@/lib/services/errors';
import { authorizeOrderMutationAccess } from '@/lib/services/shop/order-access';
import { acceptIntlQuote } from '@/lib/services/shop/quotes';
import {
  intlQuoteAcceptPayloadSchema,
  orderIdParamSchema,
} from '@/lib/validation/shop';

import { mapQuoteErrorStatus, noStoreJson } from '../quote-utils';

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

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return noStoreJson(
      { code: 'INVALID_PAYLOAD', message: 'Invalid JSON body.' },
      { status: 400 }
    );
  }
  const parsedBody = intlQuoteAcceptPayloadSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return noStoreJson(
      { code: 'INVALID_PAYLOAD', message: 'Invalid payload.' },
      { status: 400 }
    );
  }

  const statusToken = request.nextUrl.searchParams.get('statusToken');
  const auth = await authorizeOrderMutationAccess({
    orderId,
    statusToken,
    requiredScope: 'order_quote_accept',
  });
  if (!auth.authorized) {
    return noStoreJson({ code: auth.code }, { status: auth.status });
  }

  try {
    const result = await acceptIntlQuote({
      orderId,
      requestId,
      actorUserId: auth.actorUserId,
      version: parsedBody.data.version,
    });

    return noStoreJson(
      {
        success: true,
        orderId: result.orderId,
        version: result.version,
        quoteStatus: result.quoteStatus,
        changed: result.changed,
        paymentDeadlineAt: result.paymentDeadlineAt?.toISOString() ?? null,
        totalAmountMinor: result.totalAmountMinor ?? null,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return noStoreJson({ code: error.code }, { status: 404 });
    }

    if (error instanceof InvalidPayloadError) {
      logWarn('quote_accept_rejected', {
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
        { status: mapQuoteErrorStatus(error.code, 'accept') }
      );
    }

    logError('quote_accept_failed', error, {
      ...baseMeta,
      orderId,
      code: 'QUOTE_ACCEPT_FAILED',
    });

    return noStoreJson(
      { code: 'INTERNAL_ERROR', message: 'Unable to accept quote.' },
      { status: 500 }
    );
  }
}
