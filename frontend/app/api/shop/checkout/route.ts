import crypto from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { MoneyValueError } from '@/db/queries/shop/orders';
import { getCurrentUser } from '@/lib/auth';
import { isMonobankEnabled } from '@/lib/env/monobank';
import { logError, logInfo, logWarn } from '@/lib/logging';
import { guardBrowserSameOrigin } from '@/lib/security/origin';
import {
  enforceRateLimit,
  getRateLimitSubject,
  rateLimitResponse,
} from '@/lib/security/rate-limit';
import { IdempotencyConflictError } from '@/lib/services/errors';
import {
  InsufficientStockError,
  InvalidPayloadError,
  InvalidVariantError,
  OrderStateInvalidError,
  PriceConfigError,
  PspUnavailableError,
} from '@/lib/services/errors';
import { createOrderWithItems, restockOrder } from '@/lib/services/orders';
import {
  ensureStripePaymentIntentForOrder,
  PaymentAttemptsExhaustedError,
} from '@/lib/services/orders/payment-attempts';
import { type PaymentProvider, type PaymentStatus } from '@/lib/shop/payments';
import { resolveRequestLocale } from '@/lib/shop/request-locale';
import { createStatusToken } from '@/lib/shop/status-token';
import {
  checkoutPayloadSchema,
  idempotencyKeySchema,
} from '@/lib/validation/shop';

type CheckoutRequestedProvider = 'stripe' | 'monobank';

const EXPECTED_BUSINESS_ERROR_CODES = new Set([
  'IDEMPOTENCY_CONFLICT',
  'INVALID_PAYLOAD',
  'INVALID_VARIANT',
  'INSUFFICIENT_STOCK',
  'PRICE_CONFIG_ERROR',
  'PAYMENT_ATTEMPTS_EXHAUSTED',
]);

function parseRequestedProvider(
  raw: unknown
): CheckoutRequestedProvider | 'invalid' | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return 'invalid';

  const normalized = raw.trim().toLowerCase();
  if (!normalized) return 'invalid';

  if (normalized === 'stripe' || normalized === 'monobank') {
    return normalized;
  }

  return 'invalid';
}

function isMonoAlias(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  return raw.trim().toLowerCase() === 'mono';
}

function stripMonobankClientMoneyFields(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }

  const {
    amount,
    amountMinor,
    totalAmount,
    totalAmountMinor,
    currency,
    ...rest
  } = payload as Record<string, unknown>;

  void amount;
  void amountMinor;
  void totalAmount;
  void totalAmountMinor;
  void currency;

  return rest;
}

function getErrorCode(err: unknown): string | null {
  if (typeof err !== 'object' || err === null) return null;

  const e = err as { code?: unknown };
  return typeof e.code === 'string' ? e.code : null;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function isMonobankInvalidRequestError(error: unknown): boolean {
  const code = getErrorCode(error);

  if (error instanceof InvalidPayloadError) return true;
  if (error instanceof InvalidVariantError) return true;
  if (code === 'INVALID_PAYLOAD' || code === 'INVALID_VARIANT') return true;

  if (!error || typeof error !== 'object') return false;

  const maybeIssues = (error as { issues?: unknown }).issues;
  if (Array.isArray(maybeIssues)) return true;

  const maybeName = (error as { name?: unknown }).name;
  if (typeof maybeName === 'string' && maybeName === 'ZodError') return true;

  return false;
}

function mapMonobankCheckoutError(error: unknown) {
  const code = getErrorCode(error);

  if (isMonobankInvalidRequestError(error)) {
    return {
      code: 'INVALID_REQUEST',
      message: getErrorMessage(error, 'Invalid request.'),
      status: 400,
    } as const;
  }

  if (
    error instanceof InsufficientStockError ||
    code === 'INSUFFICIENT_STOCK' ||
    code === 'OUT_OF_STOCK'
  ) {
    return {
      code: 'OUT_OF_STOCK',
      message: getErrorMessage(error, 'Insufficient stock.'),
      status: 409,
    } as const;
  }

  if (error instanceof PriceConfigError || code === 'PRICE_CONFIG_ERROR') {
    return {
      code: 'PRICE_CONFIG_ERROR',
      message: getErrorMessage(error, 'Price configuration error.'),
      status: 422,
      details:
        error instanceof PriceConfigError
          ? {
              productId: error.productId,
              currency: error.currency,
            }
          : undefined,
    } as const;
  }

  if (
    error instanceof PspUnavailableError ||
    code === 'PSP_UNAVAILABLE' ||
    code === 'PSP_INVOICE_PERSIST_FAILED'
  ) {
    return {
      code: 'PSP_UNAVAILABLE',
      message: 'Payment provider unavailable.',
      status: 503,
    } as const;
  }

  if (
    error instanceof IdempotencyConflictError ||
    code === 'IDEMPOTENCY_CONFLICT'
  ) {
    return {
      code: 'CHECKOUT_IDEMPOTENCY_CONFLICT',
      message:
        error instanceof IdempotencyConflictError
          ? error.message
          : 'Checkout idempotency conflict.',
      status: 409,
      details:
        error instanceof IdempotencyConflictError ? error.details : undefined,
    } as const;
  }

  return {
    code: 'CHECKOUT_FAILED',
    message: 'Unable to process checkout.',
    status: 500,
  } as const;
}

function isExpectedBusinessError(err: unknown): boolean {
  const code = getErrorCode(err);
  if (code && EXPECTED_BUSINESS_ERROR_CODES.has(code)) return true;

  if (err instanceof IdempotencyConflictError) return true;
  if (err instanceof InvalidPayloadError) return true;
  if (err instanceof InsufficientStockError) return true;
  if (err instanceof PriceConfigError) return true;
  if (err instanceof InvalidVariantError) return true;

  return false;
}

function errorResponse(
  code: string,
  message: string,
  status: number,
  details?: unknown
) {
  const res = NextResponse.json(
    {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
    { status }
  );

  res.headers.set('Cache-Control', 'no-store');
  return res;
}

function getIdempotencyKey(request: NextRequest) {
  const headerKey = request.headers.get('Idempotency-Key');
  if (headerKey === null || headerKey === undefined) return null;

  const parsed = idempotencyKeySchema.safeParse(headerKey);
  if (!parsed.success) return parsed.error;

  return parsed.data;
}

type CheckoutOrderShape = {
  id: string;
  currency: string;
  totalAmount: number;
  paymentStatus: PaymentStatus;
  paymentProvider: PaymentProvider;
  paymentIntentId: string | null;
};

function buildCheckoutResponse({
  order,
  itemCount,
  clientSecret,
  status,
}: {
  order: CheckoutOrderShape;
  itemCount: number;
  clientSecret: string | null;
  status: number;
}) {
  const res = NextResponse.json(
    {
      success: true,
      order: {
        id: order.id,
        currency: order.currency,
        totalAmount: order.totalAmount,
        itemCount,
        paymentStatus: order.paymentStatus,
        paymentProvider: order.paymentProvider,
        paymentIntentId: order.paymentIntentId,
        clientSecret,
      },
      orderId: order.id,
      paymentStatus: order.paymentStatus,
      paymentProvider: order.paymentProvider,
      paymentIntentId: order.paymentIntentId,
      clientSecret,
    },
    { status }
  );

  res.headers.set('Cache-Control', 'no-store');
  return res;
}

function buildMonobankCheckoutResponse({
  order,
  itemCount,
  status,
  attemptId,
  pageUrl,
  currency,
  totalAmountMinor,
}: {
  order: CheckoutOrderShape;
  itemCount: number;
  status: number;
  attemptId: string;
  pageUrl: string;
  currency: 'UAH';
  totalAmountMinor: number;
}) {
  const res = NextResponse.json(
    {
      success: true,
      order: {
        id: order.id,
        currency: order.currency,
        totalAmount: order.totalAmount,
        itemCount,
        paymentStatus: order.paymentStatus,
        paymentProvider: order.paymentProvider,
        paymentIntentId: order.paymentIntentId,
        clientSecret: null,
      },
      orderId: order.id,
      paymentStatus: order.paymentStatus,
      paymentProvider: order.paymentProvider,
      paymentIntentId: order.paymentIntentId,
      clientSecret: null,
      attemptId,
      pageUrl,
      provider: 'mono' as const,
      currency,
      totalAmountMinor,
    },
    { status }
  );

  res.headers.set('Cache-Control', 'no-store');
  return res;
}

function getSessionUserId(user: unknown): string | null {
  if (!user || typeof user !== 'object') return null;

  const candidate =
    (user as { id?: unknown; userId?: unknown }).id ??
    (user as { userId?: unknown }).userId;

  if (typeof candidate !== 'string') return null;

  const trimmed = candidate.trim();
  return trimmed.length ? trimmed : null;
}
async function readJsonBody(request: NextRequest): Promise<unknown> {
  const raw = await request.text();

  if (!raw || !raw.trim()) {
    throw new Error('EMPTY_BODY');
  }

  const normalized = raw.replace(/^\uFEFF/, '');

  return JSON.parse(normalized);
}

export async function POST(request: NextRequest) {
  const requestId =
    request.headers.get('x-request-id')?.trim() || crypto.randomUUID();

  const baseMeta = {
    requestId,
    route: request.nextUrl.pathname,
    method: request.method,
  };

  const blocked = guardBrowserSameOrigin(request);
  if (blocked) {
    logWarn('checkout_origin_blocked', { ...baseMeta, code: 'ORIGIN_BLOCKED' });

    blocked.headers.set('Cache-Control', 'no-store');
    return blocked;
  }

  let body: unknown;

  try {
    body = await readJsonBody(request);
  } catch (error) {
    logWarn('checkout_payload_parse_failed', {
      ...baseMeta,
      code: 'INVALID_PAYLOAD',
      reason: error instanceof Error ? error.message : String(error),
    });

    return errorResponse(
      'INVALID_PAYLOAD',
      'Unable to process cart data.',
      400
    );
  }

  let monobankRequestHint = false;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const { paymentProvider, provider } = body as Record<string, unknown>;
    const rawProvider = paymentProvider ?? provider;
    const parsedProvider = parseRequestedProvider(rawProvider);
    monobankRequestHint =
      parsedProvider === 'monobank' ||
      (parsedProvider === 'invalid' && isMonoAlias(rawProvider));
  }

  const idempotencyKey = getIdempotencyKey(request);

  if (idempotencyKey === null) {
    logWarn('checkout_missing_idempotency_key', {
      ...baseMeta,
      code: 'MISSING_IDEMPOTENCY_KEY',
    });

    if (monobankRequestHint) {
      return errorResponse(
        'INVALID_REQUEST',
        'Idempotency-Key header is required.',
        400
      );
    }

    return errorResponse(
      'MISSING_IDEMPOTENCY_KEY',
      'Idempotency-Key header is required.',
      400
    );
  }

  if (idempotencyKey instanceof Error) {
    logWarn('checkout_invalid_idempotency_key', {
      ...baseMeta,
      code: 'INVALID_IDEMPOTENCY_KEY',
    });

    if (monobankRequestHint) {
      return errorResponse(
        'INVALID_REQUEST',
        'Idempotency key must be 16-128 chars and contain only A-Z a-z 0-9 _ -.',
        400,
        idempotencyKey.format?.()
      );
    }

    return errorResponse(
      'INVALID_IDEMPOTENCY_KEY',
      'Idempotency key must be 16-128 chars and contain only A-Z a-z 0-9 _ -.',
      400,
      idempotencyKey.format?.()
    );
  }

  const idempotencyKeyShort = idempotencyKey.slice(0, 32);

  const meta = {
    ...baseMeta,
    idempotencyKey: idempotencyKeyShort,
  };

  let requestedProvider: CheckoutRequestedProvider | null = null;
  let payloadForValidation: unknown = body;

  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const { paymentProvider, provider, ...rest } = body as Record<
      string,
      unknown
    >;
    const rawProvider = paymentProvider ?? provider;
    const parsedProvider = parseRequestedProvider(rawProvider);

    if (parsedProvider === 'invalid') {
      if (isMonoAlias(rawProvider)) {
        return errorResponse('INVALID_REQUEST', 'Invalid request.', 422);
      }

      return errorResponse(
        'PAYMENTS_PROVIDER_INVALID',
        'Invalid payment provider.',
        422
      );
    }

    requestedProvider = parsedProvider;
    payloadForValidation = rest;
  }

  const selectedProvider: CheckoutRequestedProvider =
    requestedProvider ?? 'stripe';
  if (selectedProvider === 'monobank') {
    payloadForValidation = stripMonobankClientMoneyFields(payloadForValidation);
  }

  const paymentsEnabled =
    (process.env.PAYMENTS_ENABLED ?? '').trim() === 'true';
  const stripePaymentsEnabled =
    (process.env.STRIPE_PAYMENTS_ENABLED ?? '').trim() === 'true';

  if (selectedProvider === 'monobank') {
    let enabled = false;

    try {
      enabled = isMonobankEnabled();
    } catch (error) {
      logError('monobank_env_invalid', error, {
        ...baseMeta,
        code: 'MONOBANK_ENV_INVALID',
      });
      enabled = false;
    }

    if (!enabled) {
      logWarn('provider_disabled', {
        requestedProvider: 'monobank',
        requestId,
      });

      return errorResponse('INVALID_REQUEST', 'Invalid request.', 422);
    }

    if (!paymentsEnabled) {
      logWarn('monobank_payments_disabled', {
        ...baseMeta,
        code: 'PAYMENTS_DISABLED',
      });

      return errorResponse(
        'PSP_UNAVAILABLE',
        'Payment provider unavailable.',
        503
      );
    }
  }

  const parsedPayload = checkoutPayloadSchema.safeParse(payloadForValidation);

  if (!parsedPayload.success) {
    if (selectedProvider === 'monobank') {
      logWarn('checkout_invalid_request', {
        ...meta,
        code: 'INVALID_REQUEST',
        issuesCount: parsedPayload.error.issues?.length ?? 0,
      });

      return errorResponse(
        'INVALID_REQUEST',
        'Invalid request.',
        400,
        parsedPayload.error.format()
      );
    }

    logWarn('checkout_invalid_payload', {
      ...meta,
      code: 'INVALID_PAYLOAD',
      issuesCount: parsedPayload.error.issues?.length ?? 0,
    });

    return errorResponse(
      'INVALID_PAYLOAD',
      'Invalid checkout payload',
      400,
      parsedPayload.error.format()
    );
  }

  const { items, userId } = parsedPayload.data;
  const itemCount = items.reduce((total, item) => total + item.quantity, 0);
  const locale = resolveRequestLocale(request);

  let currentUser: unknown = null;
  try {
    currentUser = await getCurrentUser();
  } catch (error) {
    logError('checkout_auth_user_resolve_failed', error, {
      ...meta,
      code: 'AUTH_USER_RESOLVE_FAILED',
    });

    currentUser = null;
  }

  const sessionUserId = getSessionUserId(currentUser);
  const authMeta = {
    ...meta,
    sessionUserId,
  };

  if (userId) {
    if (!sessionUserId) {
      logWarn('checkout_user_id_not_allowed', {
        ...authMeta,
        code: 'USER_ID_NOT_ALLOWED',
      });

      if (selectedProvider === 'monobank') {
        return errorResponse(
          'INVALID_REQUEST',
          'userId is not allowed for guest checkout.',
          400
        );
      }

      return errorResponse(
        'USER_ID_NOT_ALLOWED',
        'userId is not allowed for guest checkout.',
        400
      );
    }

    if (userId !== sessionUserId) {
      logWarn('checkout_user_mismatch', {
        ...authMeta,
        code: 'USER_MISMATCH',
      });

      if (selectedProvider === 'monobank') {
        return errorResponse(
          'INVALID_REQUEST',
          'Authenticated user does not match payload userId.',
          400
        );
      }

      return errorResponse(
        'USER_MISMATCH',
        'Authenticated user does not match payload userId.',
        400
      );
    }
  }

  const checkoutSubject = sessionUserId ?? getRateLimitSubject(request);

  const limitParsed = Number.parseInt(
    process.env.CHECKOUT_RATE_LIMIT_MAX ?? '',
    10
  );
  const windowParsed = Number.parseInt(
    process.env.CHECKOUT_RATE_LIMIT_WINDOW_SECONDS ?? '',
    10
  );

  const limit =
    Number.isFinite(limitParsed) && limitParsed > 0 ? limitParsed : 10;
  const windowSeconds =
    Number.isFinite(windowParsed) && windowParsed > 0 ? windowParsed : 300;

  const decision = await enforceRateLimit({
    key: `checkout:${checkoutSubject}`,
    limit,
    windowSeconds,
  });

  if (!decision.ok) {
    logWarn('checkout_rate_limited', {
      ...authMeta,
      code: 'RATE_LIMITED',
      retryAfterSeconds: decision.retryAfterSeconds,
    });

    return rateLimitResponse({
      retryAfterSeconds: decision.retryAfterSeconds,
      details: { scope: 'checkout' },
    });
  }

  // if (selectedProvider === 'stripe' && !stripePaymentsEnabled) {
  //   logWarn('checkout_payments_disabled', {
  //     ...authMeta,
  //     code: 'PAYMENTS_DISABLED',
  //     provider: 'stripe',
  //   });

  //   return errorResponse('PAYMENTS_DISABLED', 'Payments are disabled.', 503);
  // }

  try {
    const result = await createOrderWithItems({
      items,
      idempotencyKey,
      userId: sessionUserId,
      locale,
      paymentProvider: selectedProvider === 'monobank' ? 'monobank' : undefined,
    });

    const { order } = result;
    const orderMeta = {
      ...authMeta,
      orderId: order.id,
      paymentProvider: order.paymentProvider,
      paymentStatus: order.paymentStatus,
      paymentIntentId: order.paymentIntentId ?? null,
    };

    // NOTE: Some schemas/types still narrow order.paymentProvider to 'stripe'|'none'.
    // Runtime may be 'monobank' here; widen locally to avoid TS2367.
    const orderProvider = order.paymentProvider as unknown as
      | 'stripe'
      | 'monobank'
      | 'none';

    const stripePaymentFlow =
      stripePaymentsEnabled && orderProvider === 'stripe';
    const monobankPaymentFlow = orderProvider === 'monobank';

    if (!result.isNew) {
      if (stripePaymentFlow) {
        try {
          const ensured = await ensureStripePaymentIntentForOrder({
            orderId: order.id,
            existingPaymentIntentId: order.paymentIntentId ?? null,
          });

          return buildCheckoutResponse({
            order: {
              id: order.id,
              currency: order.currency,
              totalAmount: order.totalAmount,
              paymentStatus: order.paymentStatus,
              paymentProvider: order.paymentProvider,
              paymentIntentId: ensured.paymentIntentId,
            },
            itemCount,
            clientSecret: ensured.clientSecret,
            status: 200,
          });
        } catch (error) {
          if (error instanceof PaymentAttemptsExhaustedError) {
            try {
              await restockOrder(order.id, { reason: 'failed' });
            } catch (restockError) {
              logError('checkout_restock_failed', restockError, {
                ...orderMeta,
                code: 'RESTOCK_FAILED',
                reason: 'attempts_exhausted',
              });
            }
            logWarn('checkout_payment_attempts_exhausted', {
              ...orderMeta,
              code: 'PAYMENT_ATTEMPTS_EXHAUSTED',
              provider: error.provider,
            });

            return errorResponse(
              'PAYMENT_ATTEMPTS_EXHAUSTED',
              'Payment attempts exhausted for this order.',
              409,
              { orderId: error.orderId, provider: error.provider }
            );
          }

          if (error instanceof InvalidPayloadError) {
            logWarn('checkout_conflict', {
              ...orderMeta,
              code: 'CHECKOUT_CONFLICT',
              reason: 'payment_init_state_conflict',
            });

            return errorResponse(
              'CHECKOUT_CONFLICT',
              'Order state conflict while initializing payment. Retry with the same Idempotency-Key.',
              409,
              { orderId: order.id }
            );
          }

          if (error instanceof OrderStateInvalidError) {
            logError('checkout_order_state_invalid', error, {
              ...orderMeta,
              code: error.code,
            });

            return errorResponse(error.code, error.message, 500, {
              orderId: error.orderId,
              ...(error.details ? { details: error.details } : {}),
            });
          }

          logError('checkout_payment_init_failed', error, {
            ...orderMeta,
            code: 'STRIPE_ERROR',
          });

          return errorResponse(
            'STRIPE_ERROR',
            'Unable to initiate payment.',
            502
          );
        }
      }

      if (monobankPaymentFlow) {
        logInfo('monobank_lazy_import_invoked', {
          requestId,
          orderId: order.id,
        });

        const { createMonobankAttemptAndInvoice } =
          await import('@/lib/services/orders/monobank');
        const statusToken = createStatusToken({ orderId: order.id });

        const monobankAttempt = await createMonobankAttemptAndInvoice({
          orderId: order.id,
          statusToken,
          requestId,
        });

        if (result.totalCents !== monobankAttempt.totalAmountMinor) {
          logError(
            'checkout_mono_amount_mismatch',
            new Error('Monobank amount mismatch'),
            {
              ...orderMeta,
              code: 'MONO_AMOUNT_MISMATCH',
              totalCents: result.totalCents,
              totalAmountMinor: monobankAttempt.totalAmountMinor,
            }
          );

          return errorResponse(
            'CHECKOUT_FAILED',
            'Unable to process checkout.',
            500
          );
        }

        return buildMonobankCheckoutResponse({
          order: {
            id: order.id,
            currency: order.currency,
            totalAmount: order.totalAmount,
            paymentStatus: order.paymentStatus,
            paymentProvider: order.paymentProvider,
            paymentIntentId: order.paymentIntentId ?? null,
          },
          itemCount,
          status: 200,
          attemptId: monobankAttempt.attemptId,
          pageUrl: monobankAttempt.pageUrl,
          currency: monobankAttempt.currency,
          totalAmountMinor: monobankAttempt.totalAmountMinor,
        });
      }

      return buildCheckoutResponse({
        order: {
          id: order.id,
          currency: order.currency,
          totalAmount: order.totalAmount,
          paymentStatus: order.paymentStatus,
          paymentProvider: order.paymentProvider,
          paymentIntentId: order.paymentIntentId ?? null,
        },
        itemCount,
        clientSecret: null,
        status: 200,
      });
    }

    if (monobankPaymentFlow) {
      logInfo('monobank_lazy_import_invoked', {
        requestId,
        orderId: order.id,
      });

      const { createMonobankAttemptAndInvoice } =
        await import('@/lib/services/orders/monobank');
      const statusToken = createStatusToken({ orderId: order.id });

      const monobankAttempt = await createMonobankAttemptAndInvoice({
        orderId: order.id,
        statusToken,
        requestId,
      });

      if (result.totalCents !== monobankAttempt.totalAmountMinor) {
        logError(
          'checkout_mono_amount_mismatch',
          new Error('Monobank amount mismatch'),
          {
            ...orderMeta,
            code: 'MONO_AMOUNT_MISMATCH',
            totalCents: result.totalCents,
            totalAmountMinor: monobankAttempt.totalAmountMinor,
          }
        );

        return errorResponse(
          'CHECKOUT_FAILED',
          'Unable to process checkout.',
          500
        );
      }

      return buildMonobankCheckoutResponse({
        order: {
          id: order.id,
          currency: order.currency,
          totalAmount: order.totalAmount,
          paymentStatus: order.paymentStatus,
          paymentProvider: order.paymentProvider,
          paymentIntentId: order.paymentIntentId ?? null,
        },
        itemCount,
        status: 201,
        attemptId: monobankAttempt.attemptId,
        pageUrl: monobankAttempt.pageUrl,
        currency: monobankAttempt.currency,
        totalAmountMinor: monobankAttempt.totalAmountMinor,
      });
    }

    if (!stripePaymentFlow) {
      return buildCheckoutResponse({
        order: {
          id: order.id,
          currency: order.currency,
          totalAmount: order.totalAmount,
          paymentStatus: order.paymentStatus,
          paymentProvider: order.paymentProvider,
          paymentIntentId: order.paymentIntentId ?? null,
        },
        itemCount,
        clientSecret: null,
        status: 201,
      });
    }

    try {
      const ensured = await ensureStripePaymentIntentForOrder({
        orderId: order.id,
        existingPaymentIntentId: order.paymentIntentId ?? null,
      });

      return buildCheckoutResponse({
        order: {
          id: order.id,
          currency: order.currency,
          totalAmount: order.totalAmount,
          paymentStatus: order.paymentStatus,
          paymentProvider: order.paymentProvider,
          paymentIntentId: ensured.paymentIntentId,
        },
        itemCount,
        clientSecret: ensured.clientSecret,
        status: 201,
      });
    } catch (error) {
      if (error instanceof InvalidPayloadError) {
        logWarn('checkout_conflict', {
          ...orderMeta,
          code: 'CHECKOUT_CONFLICT',
          reason: 'payment_init_state_conflict',
        });

        return errorResponse(
          'CHECKOUT_CONFLICT',
          'Order state conflict while initializing payment. Retry with the same Idempotency-Key.',
          409,
          { orderId: order.id }
        );
      }
      if (error instanceof PaymentAttemptsExhaustedError) {
        try {
          await restockOrder(order.id, { reason: 'failed' });
        } catch (restockError) {
          logError('checkout_restock_failed', restockError, {
            ...orderMeta,
            code: 'RESTOCK_FAILED',
            reason: 'attempts_exhausted',
          });
        }
        logWarn('checkout_payment_attempts_exhausted', {
          ...orderMeta,
          code: 'PAYMENT_ATTEMPTS_EXHAUSTED',
          provider: error.provider,
        });

        return errorResponse(
          'PAYMENT_ATTEMPTS_EXHAUSTED',
          'Payment attempts exhausted for this order.',
          409,
          { orderId: error.orderId, provider: error.provider }
        );
      }

      logError('checkout_payment_init_failed', error, {
        ...orderMeta,
        code: 'STRIPE_ERROR',
      });

      try {
        await restockOrder(order.id, { reason: 'failed' });
      } catch (restockError) {
        logError('checkout_restock_failed', restockError, {
          ...orderMeta,
          code: 'RESTOCK_FAILED',
          reason: 'payment_init_failure',
        });
      }
      if (error instanceof OrderStateInvalidError) {
        logError('checkout_order_state_invalid', error, {
          ...orderMeta,
          code: error.code,
        });

        return errorResponse(error.code, error.message, 500, {
          orderId: error.orderId,
          ...(error.details ? { details: error.details } : {}),
        });
      }
      return errorResponse('STRIPE_ERROR', 'Unable to initiate payment.', 502);
    }
  } catch (error) {
    const errorOrderId =
      typeof (error as any)?.orderId === 'string'
        ? (error as any).orderId
        : null;

    if (isExpectedBusinessError(error)) {
      logWarn('checkout_business_rejected', {
        ...authMeta,
        code: getErrorCode(error) ?? 'UNKNOWN',
        orderId: errorOrderId,
      });
    } else {
      logError('checkout_failed', error, {
        ...authMeta,
        code: getErrorCode(error) ?? 'INTERNAL_ERROR',
        orderId: errorOrderId,
      });
    }

    if (selectedProvider === 'monobank') {
      const mapped = mapMonobankCheckoutError(error);
      return errorResponse(
        mapped.code,
        mapped.message,
        mapped.status,
        mapped.details
      );
    }

    if (error instanceof InvalidPayloadError) {
      return errorResponse(
        error.code,
        error.message || 'Invalid checkout payload',
        400
      );
    }

    if (error instanceof InvalidVariantError) {
      return errorResponse(error.code, error.message, 400, {
        productId: error.productId,
        field: error.field,
        value: error.value,
        allowed: error.allowed,
      });
    }

    if (error instanceof IdempotencyConflictError) {
      return errorResponse(error.code, error.message, 409, error.details);
    }

    if (error instanceof OrderStateInvalidError) {
      return errorResponse(error.code, error.message, 500, {
        orderId: error.orderId,
        field: error.field,
        rawValue: error.rawValue,
        ...(error.details ? { details: error.details } : {}),
      });
    }

    if (error instanceof PriceConfigError) {
      return errorResponse(error.code, error.message, 400, {
        productId: error.productId,
        currency: error.currency,
      });
    }

    if (
      error instanceof PspUnavailableError ||
      getErrorCode(error) === 'PSP_UNAVAILABLE'
    ) {
      return errorResponse(
        'PSP_UNAVAILABLE',
        'Payment provider unavailable.',
        503
      );
    }

    if (error instanceof InsufficientStockError) {
      return errorResponse('INSUFFICIENT_STOCK', error.message, 409);
    }

    if (error instanceof MoneyValueError) {
      return errorResponse(
        'PRICE_DATA_ERROR',
        'Invalid stored price data for one or more products.',
        500,
        {
          productId: error.productId,
          field: error.field,
          rawValue: error.rawValue,
        }
      );
    }

    return errorResponse('INTERNAL_ERROR', 'Unable to process checkout.', 500);
  }
}
