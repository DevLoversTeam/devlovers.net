import { NextRequest, NextResponse } from 'next/server';

import { MoneyValueError } from '@/db/queries/shop/orders';
import { resolveLocaleAndCurrency } from '@/lib/shop/request-locale';

import { rehydrateCartItems } from '@/lib/services/products';
import { cartRehydratePayloadSchema } from '@/lib/validation/shop';
import { InvalidPayloadError, PriceConfigError } from '@/lib/services/errors';
import { logError } from '@/lib/logging';

function normalizeCartPayload(body: unknown) {
  if (!body || typeof body !== 'object') return body;
  const { items, ...rest } = body as { items?: unknown };

  if (!Array.isArray(items)) return body;

  return {
    ...rest,
    items: items.map(item => {
      if (!item || typeof item !== 'object') return item;
      const { quantity, ...itemRest } = item as { quantity?: unknown };
      const normalizedQuantity =
        typeof quantity === 'string' && quantity.trim().length > 0
          ? Number(quantity)
          : quantity;

      return { ...itemRest, quantity: normalizedQuantity };
    }),
  };
}

function jsonError(
  status: number,
  code: string,
  message: string,
  details?: unknown
) {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status }
  );
}

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'INVALID_PAYLOAD', 'Unable to process cart data.');
  }

  const normalizedBody = normalizeCartPayload(body);
  const parsedPayload = cartRehydratePayloadSchema.safeParse(normalizedBody);

  if (!parsedPayload.success) {
    return jsonError(400, 'INVALID_PAYLOAD', 'Invalid cart payload', {
      issues: parsedPayload.error.format(),
    });
  }

  const { currency } = resolveLocaleAndCurrency(request);

  try {
    const { items } = parsedPayload.data;
    const parsedResult = await rehydrateCartItems(items, currency);
    return NextResponse.json(parsedResult);
  } catch (error) {
    logError('cart_rehydrate_failed', error);

    // Missing price for locale currency is a CONTRACT error, not a 422.
    if (error instanceof PriceConfigError) {
      return jsonError(400, error.code, error.message, {
        productId: error.productId,
        currency: error.currency,
      });
    }

    // DB misconfiguration / invalid stored money: treat as 500 (server fault),
    // but keep stable code for diagnostics.
    if (error instanceof MoneyValueError) {
      return jsonError(
        500,
        'PRICE_CONFIG_ERROR',
        'Invalid price configuration for one or more products.',
        {
          productId: error.productId,
          field: error.field,
          rawValue: error.rawValue,
        }
      );
    }

    if (error instanceof InvalidPayloadError) {
      return jsonError(400, error.code, error.message);
    }

    return jsonError(500, 'INTERNAL_ERROR', 'Unable to rehydrate cart.');
  }
}
