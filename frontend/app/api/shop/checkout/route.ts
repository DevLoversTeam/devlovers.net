import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { isPaymentsEnabled } from '@/lib/env/stripe';
import { logError } from '@/lib/logging';
import { resolveRequestLocale } from '@/lib/shop/request-locale';

import { MoneyValueError } from '@/db/queries/shop/orders';
import { createPaymentIntent, retrievePaymentIntent } from '@/lib/psp/stripe';
import {
  InsufficientStockError,
  InvalidPayloadError,
  PriceConfigError,
  OrderStateInvalidError,
} from '@/lib/services/errors';

import {
  createOrderWithItems,
  restockOrder,
  setOrderPaymentIntent,
} from '@/lib/services/orders';
import {
  checkoutPayloadSchema,
  idempotencyKeySchema,
} from '@/lib/validation/shop';
import { type PaymentProvider, type PaymentStatus } from '@/lib/shop/payments';

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
    throw new Error("EMPTY_BODY");
  }

  // tolerate BOM / odd whitespace
  const normalized = raw.replace(/^\uFEFF/, "");

  return JSON.parse(normalized);
}


export async function POST(request: NextRequest) {
  let body: unknown;

  try {
  body = await readJsonBody(request);
} catch (error) {
    logError('Failed to parse cart payload', error);
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
    logError('Invalid checkout payload', parsedPayload.error);
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

    const { order, totalCents } = result;

    const paymentsEnabled = isPaymentsEnabled();

    if (!paymentsEnabled) {
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
        if (order.paymentStatus !== 'paid' || order.paymentIntentId) {
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

    if (!result.isNew) {
      if (stripePaymentFlow && order.paymentIntentId) {
        try {
          const paymentIntent = await retrievePaymentIntent(
            order.paymentIntentId
          );

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
            clientSecret: paymentIntent.clientSecret,
            status: 200,
          });
        } catch (error) {
          logError('Checkout payment intent retrieval failed', error);
          return errorResponse(
            'STRIPE_ERROR',
            'Unable to initiate payment.',
            400
          );
        }
      }

      if (stripePaymentFlow && !order.paymentIntentId) {
        try {
          const paymentIntent = await createPaymentIntent({
            amount: totalCents,
            currency: order.currency,
            orderId: order.id,
            idempotencyKey,
          });

          const updatedOrder = await setOrderPaymentIntent({
            orderId: order.id,
            paymentIntentId: paymentIntent.paymentIntentId,
          });

          return buildCheckoutResponse({
            order: {
              id: updatedOrder.id,
              currency: updatedOrder.currency,
              totalAmount: updatedOrder.totalAmount,
              paymentStatus: updatedOrder.paymentStatus,
              paymentProvider: updatedOrder.paymentProvider,
              paymentIntentId: updatedOrder.paymentIntentId ?? null,
            },
            itemCount,
            clientSecret: paymentIntent.clientSecret,
            status: 200,
          });
        } catch (error) {
          logError('Checkout payment intent creation failed', error);
          return errorResponse(
            'STRIPE_ERROR',
            'Unable to initiate payment.',
            400
          );
        }
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
      const paymentIntent = await createPaymentIntent({
        amount: totalCents,
        currency: order.currency,
        orderId: order.id,
        idempotencyKey,
      });

      const updatedOrder = await setOrderPaymentIntent({
        orderId: order.id,
        paymentIntentId: paymentIntent.paymentIntentId,
      });

      return buildCheckoutResponse({
        order: {
          id: updatedOrder.id,
          currency: updatedOrder.currency,
          totalAmount: updatedOrder.totalAmount,
          paymentStatus: updatedOrder.paymentStatus,
          paymentProvider: updatedOrder.paymentProvider,
          paymentIntentId: updatedOrder.paymentIntentId ?? null,
        },
        itemCount,
        clientSecret: paymentIntent.clientSecret,
        status: 201,
      });
    } catch (error) {
      logError('Checkout payment intent creation failed', error);

      try {
        await restockOrder(order.id, { reason: 'failed' });
      } catch (restockError) {
        logError(
          'Restoring stock after payment intent failure failed',
          restockError
        );
      }

      if (error instanceof Error && error.message.startsWith('STRIPE_')) {
        return errorResponse(
          'STRIPE_ERROR',
          'Unable to initiate payment.',
          400
        );
      }

      if (error instanceof OrderStateInvalidError) {
        return errorResponse(error.code, error.message, 500, {
          orderId: error.orderId,
        });
      }

      return errorResponse(
        'INTERNAL_ERROR',
        'Unable to process checkout.',
        500
      );
    }
  } catch (error) {
    logError('Checkout failed', error);

    if (error instanceof InvalidPayloadError) {
      return errorResponse(
        error.code,
        error.message || 'Invalid checkout payload',
        400
      );
    }

    if (error instanceof OrderStateInvalidError) {
      return errorResponse(error.code, error.message, 500, {
        orderId: error.orderId,
        field: (error as any).field,
        rawValue: (error as any).rawValue,
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
        'PRICE_CONFIG_ERROR',
        'Invalid price configuration for one or more products.',
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
