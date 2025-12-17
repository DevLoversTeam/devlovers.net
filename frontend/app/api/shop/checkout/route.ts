import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { isPaymentsEnabled } from "@/lib/env/stripe";
import { logError } from "@/lib/logging";
import { MoneyValueError } from "@/db/queries/shop/orders";
import { createPaymentIntent, retrievePaymentIntent } from "@/lib/psp/stripe";
import { InsufficientStockError, InvalidPayloadError } from "@/lib/services/errors";
import { createOrderWithItems, restockOrder, setOrderPaymentIntent } from "@/lib/services/orders";
import {
  checkoutPayloadSchema,
  idempotencyKeySchema,
  type PaymentProvider,
  type PaymentStatus,
} from "@/lib/validation/shop";

function errorResponse(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json(
    {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
    { status }
  );
}

function getIdempotencyKey(request: NextRequest, body: unknown) {
  const headerKey = request.headers.get("Idempotency-Key");
  const bodyKey =
    body && typeof body === "object" && "idempotencyKey" in body
      ? (body as Record<string, unknown>).idempotencyKey
      : undefined;

  const candidate = headerKey ?? bodyKey;
  if (candidate === null || candidate === undefined) return null;

  const parsed = idempotencyKeySchema.safeParse(candidate);
  if (!parsed.success) return parsed.error;

  return parsed.data;
}

function normalizeCheckoutPayload(body: unknown) {
  if (!body || typeof body !== "object") return body;
  const { items, ...rest } = body as { items?: unknown };

  if (!Array.isArray(items)) return body;

  return {
    ...rest,
    items: items.map((item) => {
      if (!item || typeof item !== "object") return item;
      const { quantity, ...itemRest } = item as { quantity?: unknown };
      const normalizedQuantity =
        typeof quantity === "string" && quantity.trim().length > 0 ? Number(quantity) : quantity;

      return { ...itemRest, quantity: normalizedQuantity };
    }),
  };
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
  if (!user || typeof user !== "object") return null;

  const candidate =
    (user as { id?: unknown; userId?: unknown }).id ?? (user as { userId?: unknown }).userId;

  if (typeof candidate !== "string") return null;

  const trimmed = candidate.trim();
  return trimmed.length ? trimmed : null;
}

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch (error) {
    logError("Failed to parse cart payload", error);
    return errorResponse("INVALID_PAYLOAD", "Unable to process cart data.", 400);
  }

  const idempotencyKey = getIdempotencyKey(request, body);

  if (idempotencyKey === null) {
    return errorResponse("MISSING_IDEMPOTENCY_KEY", "Idempotency-Key header is required.", 400);
  }

  if (idempotencyKey instanceof Error) {
    return errorResponse(
      "INVALID_IDEMPOTENCY_KEY",
      "Idempotency key must be 16-128 chars and contain only A-Z a-z 0-9 _ -.",
      400,
      idempotencyKey.format?.()
    );
  }

  const normalizedBody = normalizeCheckoutPayload(body);
  const parsedPayload = checkoutPayloadSchema.safeParse(normalizedBody);

  if (!parsedPayload.success) {
    logError("Invalid checkout payload", parsedPayload.error);
    return errorResponse("INVALID_PAYLOAD", "Invalid checkout payload", 400, parsedPayload.error.format());
  }

  const { items, userId } = parsedPayload.data;
  const itemCount = items.reduce((total, item) => total + item.quantity, 0);

  // Session user (server source of truth)
  let currentUser: unknown = null;
  try {
    currentUser = await getCurrentUser();
  } catch (error) {
    // Не валимо checkout 500 через auth lookup — просто трактуємо як guest
    logError("Failed to resolve current user", error);
    currentUser = null;
  }

  const sessionUserId = getSessionUserId(currentUser);

  // Заборона підміни userId з клієнта
  if (userId) {
    if (!sessionUserId) {
      return errorResponse("USER_ID_NOT_ALLOWED", "userId is not allowed for guest checkout.", 400);
    }
    if (userId !== sessionUserId) {
      return errorResponse("USER_MISMATCH", "Authenticated user does not match payload userId.", 400);
    }
  }

  try {
    const result = await createOrderWithItems({
      items,
      idempotencyKey,
      userId: sessionUserId, // тільки з сесії
    });

    const { order, totalCents } = result;

    const paymentsEnabled = isPaymentsEnabled();
    const stripePaymentFlow = paymentsEnabled && order.paymentProvider === "stripe";

    if (!result.isNew) {
      if (stripePaymentFlow && order.paymentIntentId) {
        try {
          const paymentIntent = await retrievePaymentIntent(order.paymentIntentId);

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
          logError("Checkout payment intent retrieval failed", error);
          return errorResponse("STRIPE_ERROR", "Unable to initiate payment.", 400);
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
          logError("Checkout payment intent creation failed", error);
          return errorResponse("STRIPE_ERROR", "Unable to initiate payment.", 400);
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
      return buildCheckoutResponse(
        {
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
        }
      );
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
      logError("Checkout payment intent creation failed", error);

      try {
        await restockOrder(order.id, { reason: "failed" });
      } catch (restockError) {
        logError("Restoring stock after payment intent failure failed", restockError);
      }

      if (error instanceof Error && error.message.startsWith("STRIPE_")) {
        return errorResponse("STRIPE_ERROR", "Unable to initiate payment.", 400);
      }

      return errorResponse("INTERNAL_ERROR", "Unable to process checkout.", 500);
    }
  } catch (error) {
    logError("Checkout failed", error);

    if (error instanceof InvalidPayloadError) {
      return errorResponse(error.code, error.message || "Invalid checkout payload", 400);
    }

    if (error instanceof InsufficientStockError) {
      return errorResponse("INSUFFICIENT_STOCK", error.message, 409);
    }

    if (error instanceof MoneyValueError) {
      return errorResponse("PRICE_CONFIG_ERROR", "Invalid price configuration for one or more products.", 500, {
        productId: error.productId,
        field: error.field,
        rawValue: error.rawValue,
      });
    }

    return errorResponse("INTERNAL_ERROR", "Unable to process checkout.", 500);
  }
}
