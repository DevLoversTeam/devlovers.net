import crypto from 'node:crypto';

import { NextRequest } from 'next/server';

import { logError, logWarn } from '@/lib/logging';
import { PspError } from '@/lib/psp/monobank';
import { guardBrowserSameOrigin } from '@/lib/security/origin';
import {
  IdempotencyConflictError,
  InvalidPayloadError,
  OrderNotFoundError,
  OrderStateInvalidError,
} from '@/lib/services/errors';
import {
  MonobankWalletConflictError,
  submitMonobankWalletPayment,
} from '@/lib/services/orders/monobank-wallet';
import { authorizeOrderMutationAccess } from '@/lib/services/shop/order-access';
import { createStatusToken } from '@/lib/shop/status-token';
import { toAbsoluteUrl } from '@/lib/shop/url';
import {
  idempotencyKeySchema,
  orderIdParamSchema,
} from '@/lib/validation/shop';

import {
  ensureMonobankPayableOrder,
  getMonobankGooglePayMaxBodyBytes,
  isMonobankGooglePayEnabled,
  noStoreJson,
  readOrderPaymentRow,
} from '../../_shared';

type SubmitPayload = {
  gToken: string;
};

function sanitizeTokenForMonobank(gToken: string): string {
  try {
    const parsed = JSON.parse(gToken);
    return JSON.stringify(parsed);
  } catch {
    return gToken;
  }
}

function parseIdempotencyKey(request: NextRequest) {
  const raw = request.headers.get('idempotency-key');
  if (!raw || !raw.trim()) {
    return { ok: false as const, code: 'MISSING_IDEMPOTENCY_KEY' };
  }

  const parsed = idempotencyKeySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, code: 'INVALID_IDEMPOTENCY_KEY' };
  }

  return { ok: true as const, idempotencyKey: parsed.data };
}

function parseSubmitPayload(rawBytes: Buffer, maxBytes: number) {
  if (rawBytes.byteLength > maxBytes) {
    return { ok: false as const, status: 413, code: 'PAYLOAD_TOO_LARGE' };
  }

  const text = rawBytes.toString('utf8').replace(/^\uFEFF/, '');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false as const, status: 400, code: 'INVALID_PAYLOAD' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false as const, status: 400, code: 'INVALID_PAYLOAD' };
  }

  const gToken = (parsed as Record<string, unknown>).gToken;
  if (typeof gToken !== 'string' || !gToken.trim()) {
    return { ok: false as const, status: 400, code: 'INVALID_PAYLOAD' };
  }

  return { ok: true as const, payload: { gToken } satisfies SubmitPayload };
}

function resolveStatusToken(
  orderId: string,
  statusToken: string | null
): string {
  const normalized = statusToken?.trim() ?? '';
  if (normalized) return normalized;

  return createStatusToken({
    orderId,
    scopes: ['status_lite', 'order_payment_init'],
  });
}

function buildPendingReturnUrl(
  orderId: string,
  statusToken: string | null
): string {
  const params = new URLSearchParams({ orderId });
  const resolvedStatusToken = resolveStatusToken(orderId, statusToken);

  params.set('statusToken', resolvedStatusToken);

  return toAbsoluteUrl(`/shop/checkout/return/monobank?${params.toString()}`);
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

  const parsedIdempotency = parseIdempotencyKey(request);
  if (!parsedIdempotency.ok) {
    return noStoreJson(
      {
        code: parsedIdempotency.code,
        message: 'Idempotency-Key header is required.',
      },
      400
    );
  }
  const idempotencyKey = parsedIdempotency.idempotencyKey;

  const statusToken = request.nextUrl.searchParams.get('statusToken');
  const auth = await authorizeOrderMutationAccess({
    orderId,
    statusToken,
    requiredScope: 'order_payment_init',
  });
  if (!auth.authorized) {
    return noStoreJson({ code: auth.code }, auth.status);
  }

  if (!isMonobankGooglePayEnabled()) {
    return noStoreJson(
      {
        code: 'MONOBANK_GPAY_DISABLED',
        message: 'Monobank Google Pay is disabled.',
      },
      409
    );
  }

  const order = await readOrderPaymentRow(orderId);
  if (!order) {
    return noStoreJson({ code: 'ORDER_NOT_FOUND' }, 404);
  }

  const guard = ensureMonobankPayableOrder({
    order,
    allowedMethods: ['monobank_google_pay'],
  });
  if (!guard.ok) {
    logWarn('monobank_google_pay_submit_rejected', {
      ...baseMeta,
      orderId,
      code: guard.code,
    });
    return noStoreJson(
      { code: guard.code, message: guard.message },
      guard.status
    );
  }

  const maxBytes = getMonobankGooglePayMaxBodyBytes();
  const contentLength = Number.parseInt(
    request.headers.get('content-length') ?? '',
    10
  );
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return noStoreJson(
      { code: 'PAYLOAD_TOO_LARGE', message: 'Request payload is too large.' },
      413
    );
  }

  let rawBodyBytes: Buffer;
  try {
    rawBodyBytes = Buffer.from(await request.arrayBuffer());
  } catch {
    return noStoreJson(
      { code: 'INVALID_PAYLOAD', message: 'Invalid request body.' },
      400
    );
  }

  const parsedPayload = parseSubmitPayload(rawBodyBytes, maxBytes);
  if (!parsedPayload.ok) {
    const status = parsedPayload.status;
    const code = parsedPayload.code;
    return noStoreJson(
      {
        code,
        message:
          code === 'PAYLOAD_TOO_LARGE'
            ? 'Request payload is too large.'
            : 'Invalid payload.',
      },
      status
    );
  }

  const cardToken = sanitizeTokenForMonobank(parsedPayload.payload.gToken);
  const webHookUrl = toAbsoluteUrl('/api/shop/webhooks/monobank');
  const pendingReturnUrl = buildPendingReturnUrl(orderId, statusToken);

  try {
    const result = await submitMonobankWalletPayment({
      orderId,
      idempotencyKey,
      cardToken,
      webHookUrl,
      redirectUrl: pendingReturnUrl,
    });

    return noStoreJson(
      {
        success: true,
        orderId,
        status: 'pending',
        submitOutcome: result.outcome,
        reused: result.reused,
        attemptId: result.attemptId,
        attemptNumber: result.attemptNumber,
        redirectUrl: result.redirectUrl,
        returnUrl: pendingReturnUrl,
      },
      result.outcome === 'unknown' ? 202 : 200
    );
  } catch (error) {
    if (error instanceof MonobankWalletConflictError) {
      return noStoreJson(
        {
          code: 'MONOBANK_WALLET_CONFLICT',
          message: error.message,
        },
        409
      );
    }

    if (error instanceof IdempotencyConflictError) {
      return noStoreJson(
        {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
        409
      );
    }

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
      const status = error.code === 'PAYMENT_ATTEMPTS_EXHAUSTED' ? 409 : 400;
      return noStoreJson(
        {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
        status
      );
    }

    if (error instanceof PspError) {
      if (error.code === 'PSP_BAD_REQUEST') {
        return noStoreJson(
          {
            code: error.code,
            message: 'Wallet token was rejected by payment provider.',
          },
          400
        );
      }

      logWarn('monobank_google_pay_submit_psp_error', {
        ...baseMeta,
        orderId,
        code: error.code,
      });
      return noStoreJson(
        {
          code: 'PSP_UNAVAILABLE',
          message: 'Payment provider is unavailable.',
        },
        503
      );
    }

    logError('monobank_google_pay_submit_failed', error, {
      ...baseMeta,
      orderId,
      code: 'INTERNAL_ERROR',
    });
    return noStoreJson(
      {
        code: 'INTERNAL_ERROR',
        message: 'Unable to submit Google Pay payment.',
      },
      500
    );
  }
}
