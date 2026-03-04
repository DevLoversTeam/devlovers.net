import crypto from 'node:crypto';

import { NextRequest } from 'next/server';

import { logError, logWarn } from '@/lib/logging';
import { guardBrowserSameOrigin } from '@/lib/security/origin';
import {
  InvalidPayloadError,
  OrderNotFoundError,
  OrderStateInvalidError,
  PspInvoicePersistError,
  PspUnavailableError,
} from '@/lib/services/errors';
import { createMonobankAttemptAndInvoice } from '@/lib/services/orders/monobank';
import { authorizeOrderMutationAccess } from '@/lib/services/shop/order-access';
import { createStatusToken } from '@/lib/shop/status-token';
import { orderIdParamSchema } from '@/lib/validation/shop';

import { ensureMonobankPayableOrder, noStoreJson, readOrderPaymentRow } from '../_shared';

function resolveStatusToken(orderId: string, statusToken: string | null): string {
  const normalized = statusToken?.trim() ?? '';
  if (normalized) return normalized;
  return createStatusToken({
    orderId,
    scopes: ['status_lite', 'order_payment_init'],
  });
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
      400
    );
  }

  const orderId = parsedParams.data.id;
  const statusToken = request.nextUrl.searchParams.get('statusToken');
  const auth = await authorizeOrderMutationAccess({
    orderId,
    statusToken,
    requiredScope: 'order_payment_init',
  });
  if (!auth.authorized) {
    return noStoreJson({ code: auth.code }, auth.status);
  }

  const order = await readOrderPaymentRow(orderId);
  if (!order) {
    return noStoreJson({ code: 'ORDER_NOT_FOUND' }, 404);
  }

  const guard = ensureMonobankPayableOrder({
    order,
    allowedMethods: ['monobank_invoice', 'monobank_google_pay'],
  });
  if (!guard.ok) {
    logWarn('monobank_invoice_fallback_rejected', {
      ...baseMeta,
      orderId,
      code: guard.code,
    });
    return noStoreJson({ code: guard.code, message: guard.message }, guard.status);
  }

  try {
    const result = await createMonobankAttemptAndInvoice({
      orderId,
      statusToken: resolveStatusToken(orderId, statusToken),
      requestId,
    });

    return noStoreJson({
      success: true,
      orderId,
      status: 'pending',
      attemptId: result.attemptId,
      attemptNumber: result.attemptNumber,
      invoiceId: result.invoiceId,
      pageUrl: result.pageUrl,
      currency: result.currency,
      totalAmountMinor: result.totalAmountMinor,
    });
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return noStoreJson({ code: error.code }, 404);
    }

    if (error instanceof OrderStateInvalidError) {
      return noStoreJson(
        {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
        409
      );
    }

    if (error instanceof InvalidPayloadError) {
      const status =
        error.code === 'CHECKOUT_CONFLICT' ||
        error.code === 'PAYMENT_ATTEMPTS_EXHAUSTED'
          ? 409
          : 400;

      return noStoreJson(
        {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
        status
      );
    }

    if (
      error instanceof PspUnavailableError ||
      error instanceof PspInvoicePersistError
    ) {
      return noStoreJson(
        {
          code: error.code,
          message: error.message,
        },
        503
      );
    }

    logError('monobank_invoice_fallback_failed', error, {
      ...baseMeta,
      orderId,
      code: 'INTERNAL_ERROR',
    });
    return noStoreJson(
      { code: 'INTERNAL_ERROR', message: 'Unable to initialize invoice payment.' },
      500
    );
  }
}
