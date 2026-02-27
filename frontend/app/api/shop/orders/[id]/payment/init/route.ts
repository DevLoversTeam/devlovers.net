import crypto from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { logError, logWarn } from '@/lib/logging';
import { guardBrowserSameOrigin } from '@/lib/security/origin';
import {
  InvalidPayloadError,
  OrderNotFoundError,
  OrderStateInvalidError,
} from '@/lib/services/errors';
import {
  ensureStripePaymentIntentForOrder,
  PaymentAttemptsExhaustedError,
} from '@/lib/services/orders/payment-attempts';
import { authorizeOrderMutationAccess } from '@/lib/services/shop/order-access';
import { assertIntlPaymentInitAllowed } from '@/lib/services/shop/quotes';
import {
  orderIdParamSchema,
  orderPaymentInitPayloadSchema,
} from '@/lib/validation/shop';

function noStoreJson(body: unknown, init?: { status?: number }) {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

function mapInitErrorStatus(code: string): number {
  if (
    code === 'QUOTE_NOT_ACCEPTED' ||
    code === 'QUOTE_INVENTORY_NOT_RESERVED' ||
    code === 'QUOTE_VERSION_CONFLICT' ||
    code === 'PAYMENT_PROVIDER_NOT_ALLOWED_FOR_INTL'
  ) {
    return 409;
  }
  if (code === 'QUOTE_PAYMENT_WINDOW_EXPIRED' || code === 'QUOTE_EXPIRED') {
    return 410;
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

  let rawBody: unknown = {};
  try {
    const raw = await request.text();
    if (raw.trim()) rawBody = JSON.parse(raw);
  } catch {
    return noStoreJson(
      { code: 'INVALID_PAYLOAD', message: 'Invalid JSON body.' },
      { status: 400 }
    );
  }

  const parsedBody = orderPaymentInitPayloadSchema.safeParse(rawBody);
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
  });
  if (!auth.authorized) {
    return noStoreJson({ code: auth.code }, { status: auth.status });
  }

  try {
    const provider = parsedBody.data.provider;
    await assertIntlPaymentInitAllowed({
      orderId,
      provider,
    });

    const ensured = await ensureStripePaymentIntentForOrder({
      orderId,
    });

    return noStoreJson(
      {
        success: true,
        orderId,
        provider,
        paymentIntentId: ensured.paymentIntentId,
        clientSecret: ensured.clientSecret,
        attemptId: ensured.attemptId,
        attemptNumber: ensured.attemptNumber,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return noStoreJson({ code: error.code }, { status: 404 });
    }
    if (error instanceof PaymentAttemptsExhaustedError) {
      return noStoreJson(
        {
          code: error.code,
          message: 'Payment attempts exhausted for this order.',
          details: {
            orderId: error.orderId,
            provider: error.provider,
          },
        },
        { status: 409 }
      );
    }
    if (error instanceof InvalidPayloadError) {
      logWarn('order_payment_init_rejected', {
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
        { status: mapInitErrorStatus(error.code) }
      );
    }
    if (error instanceof OrderStateInvalidError) {
      logWarn('order_payment_init_state_invalid', {
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
        { status: 409 }
      );
    }

    logError('order_payment_init_failed', error, {
      ...baseMeta,
      orderId,
      code: 'ORDER_PAYMENT_INIT_FAILED',
    });
    return noStoreJson(
      { code: 'INTERNAL_ERROR', message: 'Unable to initialize payment.' },
      { status: 500 }
    );
  }
}
