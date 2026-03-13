import crypto from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { MoneyValueError } from '@/db/queries/shop/orders';
import { getCurrentUser } from '@/lib/auth';
import { isMonobankEnabled } from '@/lib/env/monobank';
import { readPositiveIntEnv } from '@/lib/env/readPositiveIntEnv';
import { isPaymentsEnabled as isStripePaymentsEnabled } from '@/lib/env/stripe';
import { logError, logInfo, logWarn } from '@/lib/logging';
import { MONO_MISMATCH, monoLogWarn } from '@/lib/logging/monobank';
import { guardBrowserSameOrigin } from '@/lib/security/origin';
import {
  enforceRateLimit,
  getRateLimitSubject,
  rateLimitResponse,
} from '@/lib/security/rate-limit';
import {
  IdempotencyConflictError,
  InsufficientStockError,
  InvalidPayloadError,
  InvalidVariantError,
  OrderStateInvalidError,
  PriceConfigError,
  PspUnavailableError,
} from '@/lib/services/errors';
import {
  createOrderWithItems,
  findExistingCheckoutOrderByIdempotencyKey,
  restockOrder,
} from '@/lib/services/orders';
import {
  ensureStripePaymentIntentForOrder,
  PaymentAttemptsExhaustedError,
} from '@/lib/services/orders/payment-attempts';
import { resolveCurrencyFromLocale } from '@/lib/shop/currency';
import {
  isMethodAllowed,
  resolveCheckoutProviderCandidates,
  resolveDefaultMethodForProvider,
  type PaymentMethod,
  type PaymentProvider,
  paymentProviderValues,
  type PaymentStatus,
  paymentStatusValues,
} from '@/lib/shop/payments';
import { resolveRequestLocale } from '@/lib/shop/request-locale';
import {
  createStatusToken,
  type StatusTokenScope,
} from '@/lib/shop/status-token';
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
  'MISSING_SHIPPING_ADDRESS',
  'INVALID_SHIPPING_ADDRESS',
  'SHIPPING_METHOD_UNAVAILABLE',
  'SHIPPING_CURRENCY_UNSUPPORTED',
  'TERMS_NOT_ACCEPTED',
  'PRIVACY_NOT_ACCEPTED',
]);

const DEFAULT_CHECKOUT_RATE_LIMIT_MAX = 10;
const DEFAULT_CHECKOUT_RATE_LIMIT_WINDOW_SECONDS = 300;

const SHIPPING_ERROR_STATUS_MAP: Record<string, number> = {
  MISSING_SHIPPING_ADDRESS: 400,
  INVALID_SHIPPING_ADDRESS: 400,
  SHIPPING_METHOD_UNAVAILABLE: 422,
  SHIPPING_CURRENCY_UNSUPPORTED: 422,
};

const STATUS_TOKEN_SCOPES_STATUS_ONLY: readonly StatusTokenScope[] = [
  'status_lite',
];
const STATUS_TOKEN_SCOPES_PAYMENT_INIT: readonly StatusTokenScope[] = [
  'status_lite',
  'order_payment_init',
];

function resolveCheckoutTokenScopes(args: {
  paymentProvider: PaymentProvider;
  paymentStatus: PaymentStatus;
}): readonly StatusTokenScope[] {
  const needsPaymentInitScope =
    args.paymentProvider !== 'none' &&
    (args.paymentStatus === 'pending' ||
      args.paymentStatus === 'requires_payment');

  return needsPaymentInitScope
    ? STATUS_TOKEN_SCOPES_PAYMENT_INIT
    : STATUS_TOKEN_SCOPES_STATUS_ONLY;
}

function createCheckoutStatusToken(args: {
  orderId: string;
  paymentProvider: PaymentProvider;
  paymentStatus: PaymentStatus;
}): string {
  return createStatusToken({
    orderId: args.orderId,
    scopes: [...resolveCheckoutTokenScopes(args)],
  });
}

function isCheckoutStatusTokenRequired(args: {
  paymentProvider: PaymentProvider;
  paymentStatus: PaymentStatus;
}): boolean {
  return resolveCheckoutTokenScopes(args).includes('order_payment_init');
}

function shippingErrorStatus(code: string): number | null {
  return SHIPPING_ERROR_STATUS_MAP[code] ?? null;
}

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

function parseRequestedMethod(raw: unknown): PaymentMethod | 'invalid' | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return 'invalid';

  const normalized = raw.trim().toLowerCase();
  if (!normalized) return 'invalid';

  if (normalized === 'stripe_card') return 'stripe_card';
  if (normalized === 'monobank_invoice') return 'monobank_invoice';
  if (normalized === 'monobank_google_pay') return 'monobank_google_pay';

  return 'invalid';
}

function isMonoAlias(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  return raw.trim().toLowerCase() === 'mono';
}

function isMonobankGooglePayEnabled(): boolean {
  const raw = (process.env.SHOP_MONOBANK_GPAY_ENABLED ?? '')
    .trim()
    .toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
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

  if (code) {
    const status = shippingErrorStatus(code);
    if (status) {
      return {
        code,
        message: getErrorMessage(error, 'Invalid request.'),
        status,
      } as const;
    }
  }

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
type CheckoutCreateResult = Awaited<ReturnType<typeof createOrderWithItems>>;

function normalizeRecoveredCheckoutOrder(
  value: unknown
): CheckoutOrderShape | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
  const currency =
    typeof candidate.currency === 'string' ? candidate.currency.trim() : '';
  const totalAmount =
    typeof candidate.totalAmount === 'number' &&
    Number.isFinite(candidate.totalAmount)
      ? candidate.totalAmount
      : null;

  const paymentStatus =
    typeof candidate.paymentStatus === 'string' &&
    paymentStatusValues.includes(candidate.paymentStatus as PaymentStatus)
      ? (candidate.paymentStatus as PaymentStatus)
      : null;

  const paymentProvider =
    typeof candidate.paymentProvider === 'string' &&
    paymentProviderValues.includes(candidate.paymentProvider as PaymentProvider)
      ? (candidate.paymentProvider as PaymentProvider)
      : null;

  const paymentIntentIdRaw = candidate.paymentIntentId;
  const paymentIntentId =
    paymentIntentIdRaw === null || paymentIntentIdRaw === undefined
      ? null
      : typeof paymentIntentIdRaw === 'string'
        ? paymentIntentIdRaw.trim() || null
        : null;

  if (
    !id ||
    !currency ||
    totalAmount === null ||
    !paymentStatus ||
    !paymentProvider
  ) {
    return null;
  }

  if (
    paymentIntentIdRaw !== null &&
    paymentIntentIdRaw !== undefined &&
    typeof paymentIntentIdRaw !== 'string'
  ) {
    return null;
  }

  return {
    id,
    currency,
    totalAmount,
    paymentStatus,
    paymentProvider,
    paymentIntentId,
  };
}

function extractRecoveredCheckoutOrder(
  value: unknown
): CheckoutOrderShape | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const obj = value as Record<string, unknown>;

  if ('order' in obj) {
    return normalizeRecoveredCheckoutOrder(obj.order);
  }

  return normalizeRecoveredCheckoutOrder(obj);
}

function buildRecoveredCheckoutResult(
  order: CheckoutOrderShape
): CheckoutCreateResult {
  return {
    order: {
      ...order,
      paymentIntentId: order.paymentIntentId ?? null,
    },
    isNew: false,
    totalCents: 0,
  } as CheckoutCreateResult;
}
function buildCheckoutResponse({
  order,
  itemCount,
  clientSecret,
  statusToken,
  status,
}: {
  order: CheckoutOrderShape;
  itemCount: number;
  clientSecret: string | null;
  statusToken: string | null;
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
      statusToken,
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
  statusToken,
}: {
  order: CheckoutOrderShape;
  itemCount: number;
  status: number;
  attemptId: string;
  pageUrl: string;
  currency: 'UAH';
  totalAmountMinor: number;
  statusToken: string;
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
      statusToken,
    },
    { status }
  );

  res.headers.set('Cache-Control', 'no-store');
  return res;
}
async function cleanupNewCheckoutOrder(args: {
  orderId: string;
  orderMeta: Record<string, unknown>;
  reason: string;
}) {
  try {
    await restockOrder(args.orderId, { reason: 'failed' });
  } catch (error) {
    logError('checkout_restock_failed', error, {
      ...args.orderMeta,
      code: 'RESTOCK_FAILED',
      reason: args.reason,
    });
  }
}
async function runMonobankCheckoutFlow(args: {
  order: CheckoutOrderShape;
  itemCount: number;
  status: number;
  requestId: string;
  totalCents: number;
  orderMeta: Record<string, unknown>;
  isNew: boolean;
}) {
  try {
    logInfo('monobank_lazy_import_invoked', {
      requestId: args.requestId,
      orderId: args.order.id,
    });

    const { createMonobankAttemptAndInvoice } =
      await import('@/lib/services/orders/monobank');

    let statusToken: string;
    try {
      statusToken = createCheckoutStatusToken({
        orderId: args.order.id,
        paymentProvider: args.order.paymentProvider,
        paymentStatus: args.order.paymentStatus,
      });
    } catch (error) {
      logError('checkout_mono_status_token_create_failed', error, {
        ...args.orderMeta,
        orderId: args.order.id,
        paymentProvider: args.order.paymentProvider,
        code: 'STATUS_TOKEN_CREATE_FAILED',
        tokenScopes: resolveCheckoutTokenScopes({
          paymentProvider: args.order.paymentProvider,
          paymentStatus: args.order.paymentStatus,
        }),
      });

      if (args.isNew) {
        await cleanupNewCheckoutOrder({
          orderId: args.order.id,
          orderMeta: args.orderMeta,
          reason: 'status_token_create_failed',
        });
      }

      return errorResponse(
        'CHECKOUT_FAILED',
        'Unable to process checkout.',
        500,
        {
          orderId: args.order.id,
          paymentProvider: args.order.paymentProvider,
        }
      );
    }

    const monobankAttempt = await createMonobankAttemptAndInvoice({
      orderId: args.order.id,
      statusToken,
      requestId: args.requestId,
    });

    if (args.totalCents !== monobankAttempt.totalAmountMinor) {
      monoLogWarn(MONO_MISMATCH, {
        requestId: args.requestId,
        orderId: args.order.id,
        reason: 'checkout_total_amount_mismatch',
      });

      logError(
        'checkout_mono_amount_mismatch',
        new Error('Monobank amount mismatch'),
        {
          ...args.orderMeta,
          code: 'MONO_AMOUNT_MISMATCH',
          totalCents: args.totalCents,
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
      order: args.order,
      itemCount: args.itemCount,
      status: args.status,
      attemptId: monobankAttempt.attemptId,
      pageUrl: monobankAttempt.pageUrl,
      currency: monobankAttempt.currency,
      totalAmountMinor: monobankAttempt.totalAmountMinor,
      statusToken,
    });
  } catch (error) {
    const mapped = mapMonobankCheckoutError(error);

    if (mapped.status >= 500) {
      logError('checkout_mono_flow_failed', error, {
        ...args.orderMeta,
        code: mapped.code,
      });
    } else {
      logWarn('checkout_mono_flow_rejected', {
        ...args.orderMeta,
        code: mapped.code,
      });
    }

    return errorResponse(
      mapped.code,
      mapped.message,
      mapped.status,
      mapped.details
    );
  }
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

  const locale = resolveRequestLocale(request);

  let monobankRequestHint = false;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const { paymentProvider, provider, paymentMethod } = body as Record<
      string,
      unknown
    >;
    const rawProvider = paymentProvider ?? provider;
    const parsedProvider = parseRequestedProvider(rawProvider);
    const parsedMethod = parseRequestedMethod(paymentMethod);
    monobankRequestHint =
      parsedProvider === 'monobank' ||
      (parsedProvider === 'invalid' && isMonoAlias(rawProvider)) ||
      parsedMethod === 'monobank_invoice' ||
      parsedMethod === 'monobank_google_pay';
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
  let requestedMethod: PaymentMethod | null = null;
  let payloadForValidation: unknown = body;

  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const { paymentProvider, provider, paymentMethod, ...rest } =
      body as Record<string, unknown>;
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

    const parsedMethod = parseRequestedMethod(paymentMethod);
    if (parsedMethod === 'invalid') {
      if (parsedProvider === 'monobank' || isMonoAlias(rawProvider)) {
        return errorResponse('INVALID_REQUEST', 'Invalid request.', 422);
      }

      return errorResponse(
        'PAYMENTS_METHOD_INVALID',
        'Invalid payment method.',
        422
      );
    }

    requestedProvider = parsedProvider;
    requestedMethod = parsedMethod;
    payloadForValidation = rest;
  }

  const localeCurrency = resolveCurrencyFromLocale(locale);
  const paymentsEnabled =
    (process.env.PAYMENTS_ENABLED ?? '').trim() === 'true';

  const stripeCheckoutAvailable = isStripePaymentsEnabled({
    requirePublishableKey: true,
  });
  let monobankCheckoutAvailable = false;
  try {
    monobankCheckoutAvailable = paymentsEnabled && isMonobankEnabled();
  } catch (error) {
    logError('monobank_env_invalid', error, {
      ...baseMeta,
      code: 'MONOBANK_ENV_INVALID',
    });
  }

  const checkoutProviderCandidates = resolveCheckoutProviderCandidates({
    requestedProvider,
    requestedMethod,
    currency: localeCurrency,
  });
  const selectedProvider =
    checkoutProviderCandidates.find(candidate =>
      candidate === 'stripe'
        ? stripeCheckoutAvailable
        : monobankCheckoutAvailable
    ) ?? null;

  const fallbackProvider = selectedProvider ?? checkoutProviderCandidates[0] ?? null;
  const selectedCurrency =
    fallbackProvider === 'monobank' ? 'UAH' : localeCurrency;
  const selectedMethod =
    requestedMethod ??
    (fallbackProvider
      ? resolveDefaultMethodForProvider(fallbackProvider, selectedCurrency)
      : null);

  if (fallbackProvider === 'monobank') {
    payloadForValidation = stripMonobankClientMoneyFields(payloadForValidation);
  }

  const stripeRequestedButUnavailable =
    checkoutProviderCandidates.length === 1 &&
    checkoutProviderCandidates[0] === 'stripe' &&
    !stripeCheckoutAvailable;

  if (!selectedMethod) {
    logWarn('checkout_provider_unavailable', {
      ...baseMeta,
      code: 'PAYMENTS_DISABLED',
      requestedProvider,
      requestedMethod,
      localeCurrency,
      candidates: checkoutProviderCandidates,
      stripeCheckoutAvailable,
      monobankCheckoutAvailable,
    });

    return errorResponse(
      'PSP_UNAVAILABLE',
      'Payment provider unavailable.',
      503
    );
  }

  if (!selectedProvider && !stripeRequestedButUnavailable) {
    logWarn('checkout_provider_unavailable', {
      ...baseMeta,
      code: 'PAYMENTS_DISABLED',
      requestedProvider,
      requestedMethod,
      localeCurrency,
      candidates: checkoutProviderCandidates,
      stripeCheckoutAvailable,
      monobankCheckoutAvailable,
    });

    return errorResponse(
      'PSP_UNAVAILABLE',
      'Payment provider unavailable.',
      503
    );
  }

  if (selectedProvider) {
    if (
      selectedMethod === 'monobank_google_pay' &&
      !isMonobankGooglePayEnabled()
    ) {
      return errorResponse('INVALID_REQUEST', 'Invalid request.', 422);
    }

    if (
      !isMethodAllowed({
        provider: selectedProvider,
        method: selectedMethod,
        currency: selectedCurrency,
        flags: { monobankGooglePayEnabled: isMonobankGooglePayEnabled() },
      })
    ) {
      if (selectedProvider === 'monobank') {
        return errorResponse('INVALID_REQUEST', 'Invalid request.', 422);
      }

      return errorResponse(
        'PAYMENTS_METHOD_INVALID',
        'Invalid payment method.',
        422
      );
    }
  }

  if (
    payloadForValidation &&
    typeof payloadForValidation === 'object' &&
    !Array.isArray(payloadForValidation)
  ) {
    payloadForValidation = {
      ...(payloadForValidation as Record<string, unknown>),
      paymentProvider: fallbackProvider,
      paymentMethod: selectedMethod,
      paymentCurrency: selectedCurrency,
    };
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

  const { items, userId, shipping, country, legalConsent } = parsedPayload.data;
  const itemCount = items.reduce((total, item) => total + item.quantity, 0);

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

  const limit = readPositiveIntEnv(
    'CHECKOUT_RATE_LIMIT_MAX',
    DEFAULT_CHECKOUT_RATE_LIMIT_MAX
  );
  const windowSeconds = readPositiveIntEnv(
    'CHECKOUT_RATE_LIMIT_WINDOW_SECONDS',
    DEFAULT_CHECKOUT_RATE_LIMIT_WINDOW_SECONDS
  );

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

  try {
    let recoveredCheckoutResult: CheckoutCreateResult | null = null;

    if (stripeRequestedButUnavailable) {
      const existingCheckout =
        await findExistingCheckoutOrderByIdempotencyKey(idempotencyKey);
      const recoveredOrder = extractRecoveredCheckoutOrder(existingCheckout);

      if (!recoveredOrder) {
        logWarn('checkout_stripe_payments_disabled', {
          ...authMeta,
          code: 'PAYMENTS_DISABLED',
          recoveryAttempted: true,
        });

        return errorResponse(
          'PSP_UNAVAILABLE',
          'Payment provider unavailable.',
          503
        );
      }

      await createOrderWithItems({
        items,
        idempotencyKey,
        userId: sessionUserId,
        locale,
        country: country ?? null,
        shipping: shipping ?? null,
        legalConsent: legalConsent ?? null,
        paymentProvider: 'stripe',
        paymentMethod: selectedMethod,
      });

      recoveredCheckoutResult = buildRecoveredCheckoutResult(recoveredOrder);

      logInfo('checkout_idempotent_recovery_while_stripe_disabled', {
        ...authMeta,
        orderId: recoveredOrder.id,
        code: 'IDEMPOTENT_RECOVERY',
        validation: 'createOrderWithItems',
      });
    }

    const result =
      recoveredCheckoutResult ??
      (await createOrderWithItems({
        items,
        idempotencyKey,
        userId: sessionUserId,
        locale,
        country: country ?? null,
        shipping: shipping ?? null,
        legalConsent: legalConsent ?? null,
        paymentProvider: selectedProvider,
        paymentMethod: selectedMethod,
      }));

    const { order } = result;
    const orderMeta = {
      ...authMeta,
      orderId: order.id,
      paymentProvider: order.paymentProvider,
      paymentStatus: order.paymentStatus,
      paymentIntentId: order.paymentIntentId ?? null,
    };
    const statusTokenRequired = isCheckoutStatusTokenRequired({
      paymentProvider: order.paymentProvider,
      paymentStatus: order.paymentStatus,
    });

    const statusToken = (() => {
      try {
        return createCheckoutStatusToken({
          orderId: order.id,
          paymentProvider: order.paymentProvider,
          paymentStatus: order.paymentStatus,
        });
      } catch (error) {
        logError('checkout_status_token_create_failed', error, {
          ...orderMeta,
          code: 'STATUS_TOKEN_CREATE_FAILED',
          statusTokenRequired,
          tokenScopes: resolveCheckoutTokenScopes({
            paymentProvider: order.paymentProvider,
            paymentStatus: order.paymentStatus,
          }),
        });
        return null;
      }
    })();

    if (!statusToken && statusTokenRequired) {
      if (result.isNew) {
        await cleanupNewCheckoutOrder({
          orderId: order.id,
          orderMeta,
          reason: 'status_token_create_failed',
        });
      }

      return errorResponse(
        'CHECKOUT_FAILED',
        'Unable to process checkout.',
        500,
        {
          orderId: order.id,
          paymentProvider: order.paymentProvider,
        }
      );
    }

    const orderProvider = order.paymentProvider as unknown as
      | 'stripe'
      | 'monobank'
      | 'none';

    const stripePaymentFlow = orderProvider === 'stripe';
    const monobankPaymentFlow = orderProvider === 'monobank';

    if (stripePaymentFlow && !stripeCheckoutAvailable && result.isNew) {
      logWarn('checkout_stripe_payments_disabled', {
        ...orderMeta,
        code: 'PAYMENTS_DISABLED',
        recoveryAttempted: false,
      });

      return errorResponse(
        'PSP_UNAVAILABLE',
        'Payment provider unavailable.',
        503
      );
    }

    if (!result.isNew) {
      if (stripePaymentFlow) {
        if (!stripeCheckoutAvailable) {
          logWarn('checkout_stripe_recovery_without_payment_init', {
            ...orderMeta,
            code: 'PAYMENTS_DISABLED',
            recoveryAttempted: true,
          });

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
            statusToken,
            status: 200,
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
            statusToken,
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
      if (monobankPaymentFlow && selectedMethod === 'monobank_invoice') {
        return runMonobankCheckoutFlow({
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
          requestId,
          totalCents: result.totalCents,
          orderMeta,
          isNew: false,
        });
      }

      if (monobankPaymentFlow) {
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
          statusToken,
          status: 200,
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
        statusToken,
        status: 200,
      });
    }

    if (monobankPaymentFlow && selectedMethod === 'monobank_invoice') {
      return runMonobankCheckoutFlow({
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
        requestId,
        totalCents: result.totalCents,
        orderMeta,
        isNew: true,
      });
    }

    if (monobankPaymentFlow) {
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
        statusToken,
        status: 201,
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
        statusToken,
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
        statusToken,
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
      const customStatus = shippingErrorStatus(error.code);
      return errorResponse(
        error.code,
        error.message || 'Invalid checkout payload',
        customStatus ?? 400
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
