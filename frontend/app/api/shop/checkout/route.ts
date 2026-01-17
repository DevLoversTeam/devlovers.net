import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { isPaymentsEnabled } from '@/lib/env/stripe';
import { logError, logWarn } from '@/lib/logging';
import { resolveRequestLocale } from '@/lib/shop/request-locale';
import { IdempotencyConflictError } from '@/lib/services/errors';
import { MoneyValueError } from '@/db/queries/shop/orders';
import {
  InsufficientStockError,
  InvalidPayloadError,
  InvalidVariantError,
  PriceConfigError,
  OrderStateInvalidError,
} from '@/lib/services/errors';
import {
  checkoutPayloadSchema,
  idempotencyKeySchema,
} from '@/lib/validation/shop';
import { type PaymentProvider, type PaymentStatus } from '@/lib/shop/payments';
import {
  PaymentAttemptsExhaustedError,
  ensureStripePaymentIntentForOrder,
} from '@/lib/services/orders/payment-attempts';

import { createOrderWithItems, restockOrder } from '@/lib/services/orders';

const EXPECTED_BUSINESS_ERROR_CODES = new Set([
  'IDEMPOTENCY_CONFLICT',
  'INVALID_PAYLOAD',
  'INVALID_VARIANT',
  'INSUFFICIENT_STOCK',
  'PRICE_CONFIG_ERROR',
  'PAYMENT_ATTEMPTS_EXHAUSTED',
]);

function getErrorCode(err: unknown): string | null {
  if (typeof err !== 'object' || err === null) return null;

  const e = err as { code?: unknown };
  return typeof e.code === 'string' ? e.code : null;
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
  return NextResponse.json(
    {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
    { status }
  );
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
  return NextResponse.json(
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

  // tolerate BOM / odd whitespace
  const normalized = raw.replace(/^\uFEFF/, '');

  return JSON.parse(normalized);
}

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await readJsonBody(request);
  } catch (error) {
    logWarn('Failed to parse cart payload', {
      reason: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(
      'INVALID_PAYLOAD',
      'Unable to process cart data.',
      400
    );
  }

  const idempotencyKey = getIdempotencyKey(request);

  if (idempotencyKey === null) {
    return errorResponse(
      'MISSING_IDEMPOTENCY_KEY',
      'Idempotency-Key header is required.',
      400
    );
  }

  if (idempotencyKey instanceof Error) {
    return errorResponse(
      'INVALID_IDEMPOTENCY_KEY',
      'Idempotency key must be 16-128 chars and contain only A-Z a-z 0-9 _ -.',
      400,
      idempotencyKey.format?.()
    );
  }

  const parsedPayload = checkoutPayloadSchema.safeParse(body);

  if (!parsedPayload.success) {
    logWarn('Invalid checkout payload', {
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
    logError('Failed to resolve current user', error);
    currentUser = null;
  }

  const sessionUserId = getSessionUserId(currentUser);

  if (userId) {
    if (!sessionUserId) {
      return errorResponse(
        'USER_ID_NOT_ALLOWED',
        'userId is not allowed for guest checkout.',
        400
      );
    }
    if (userId !== sessionUserId) {
      return errorResponse(
        'USER_MISMATCH',
        'Authenticated user does not match payload userId.',
        400
      );
    }
  }

  try {
    const result = await createOrderWithItems({
      items,
      idempotencyKey,
      userId: sessionUserId,
      locale,
    });

    const { order } = result;

    const paymentsEnabled = isPaymentsEnabled();

    if (!paymentsEnabled) {
      if (
        order.paymentProvider === 'none' &&
        order.paymentStatus === 'failed'
      ) {
        return errorResponse(
          'CHECKOUT_FAILED',
          'Order could not be completed.',
          409,
          {
            orderId: order.id,
          }
        );
      }

      if (
        order.paymentProvider === 'stripe' &&
        order.paymentStatus !== 'paid'
      ) {
        return errorResponse(
          'PAYMENTS_DISABLED',
          'Payments are disabled. This order requires payment and cannot be processed.',
          409,
          { orderId: order.id, paymentStatus: order.paymentStatus }
        );
      }

      if (order.paymentProvider === 'none') {
        if (
          !['paid', 'failed'].includes(order.paymentStatus) ||
          order.paymentIntentId
        ) {
          logError(
            `Payments disabled but order is not paid/none. orderId=${
              order.id
            } provider=${order.paymentProvider} status=${
              order.paymentStatus
            } intent=${order.paymentIntentId ?? 'null'}`,
            new Error('ORDER_STATE_INVALID')
          );
          return errorResponse(
            'ORDER_STATE_INVALID',
            'Order state is invalid for payments disabled.',
            500
          );
        }
      }
    }

    const stripePaymentFlow =
      paymentsEnabled && order.paymentProvider === 'stripe';

    // =========================
    // Existing order path
    // =========================
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
            // Best-effort release to avoid holding reserved stock indefinitely.
            try {
              await restockOrder(order.id, { reason: 'failed' });
            } catch (restockError) {
              logError(
                'Restoring stock after attempts exhausted failed',
                restockError
              );
            }
            return errorResponse(
              'PAYMENT_ATTEMPTS_EXHAUSTED',
              'Payment attempts exhausted for this order.',
              409,
              { orderId: error.orderId, provider: error.provider }
            );
          }

          // Post-create/state conflict must be 409 (not 502)
          if (error instanceof InvalidPayloadError) {
            return errorResponse(
              'CHECKOUT_CONFLICT',
              'Order state conflict while initializing payment. Retry with the same Idempotency-Key.',
              409,
              { orderId: order.id }
            );
          }

          if (error instanceof OrderStateInvalidError) {
            return errorResponse(error.code, error.message, 500, {
              orderId: error.orderId,
              ...(error.details ? { details: error.details } : {}),
            });
          }

          logError('Checkout payment initialization failed', error);
          return errorResponse(
            'STRIPE_ERROR',
            'Unable to initiate payment.',
            502
          );
        }
      }

      // Not Stripe flow => return existing order as-is
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

    // =========================
    // New order path
    // =========================
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

    // Stripe new order: durable attempt layer (bounded + audited)
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
      // Conflict => 409 and DO NOT restock (leave reserved; retry/janitor)
      if (error instanceof InvalidPayloadError) {
        return errorResponse(
          'CHECKOUT_CONFLICT',
          'Order state conflict while initializing payment. Retry with the same Idempotency-Key.',
          409,
          { orderId: order.id }
        );
      }
      if (error instanceof PaymentAttemptsExhaustedError) {
        // Best-effort release to avoid holding reserved stock indefinitely
        try {
          await restockOrder(order.id, { reason: 'failed' });
        } catch (restockError) {
          logError(
            'Restoring stock after attempts exhausted failed',
            restockError
          );
        }
        return errorResponse(
          'PAYMENT_ATTEMPTS_EXHAUSTED',
          'Payment attempts exhausted for this order.',
          409,
          { orderId: error.orderId, provider: error.provider }
        );
      }

      logError('Checkout payment initialization failed', error);

      try {
        await restockOrder(order.id, { reason: 'failed' });
      } catch (restockError) {
        logError(
          'Restoring stock after payment init failure failed',
          restockError
        );
      }
      if (error instanceof OrderStateInvalidError) {
        return errorResponse(error.code, error.message, 500, {
          orderId: error.orderId,
          ...(error.details ? { details: error.details } : {}),
        });
      }
      return errorResponse('STRIPE_ERROR', 'Unable to initiate payment.', 502);
    }
  } catch (error) {
    if (isExpectedBusinessError(error)) {
      logWarn('Checkout rejected', {
        code: getErrorCode(error) ?? 'UNKNOWN',
        path: request.nextUrl.pathname,
      });
    } else {
      logError('Checkout failed', error);
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
