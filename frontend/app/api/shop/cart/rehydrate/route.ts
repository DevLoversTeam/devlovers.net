import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { MoneyValueError } from '@/db/queries/shop/orders';
import { resolveLocaleAndCurrency } from '@/lib/shop/request-locale';
import { rehydrateCartItems } from '@/lib/services/products';
import { cartRehydratePayloadSchema } from '@/lib/validation/shop';
import { InvalidPayloadError, PriceConfigError } from '@/lib/services/errors';
import { logError, logInfo, logWarn } from '@/lib/logging';

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
        typeof quantity === 'string'
          ? (() => {
              const t = quantity.trim();
              if (!t) return quantity;
              if (!/^\d+$/.test(t)) return quantity;
              const n = Number.parseInt(t, 10);
              return Number.isSafeInteger(n) ? n : quantity;
            })()
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
  const startedAtMs = Date.now();

  const requestId =
    request.headers.get('x-request-id')?.trim() || crypto.randomUUID();

  const baseMeta = {
    requestId,
    route: request.nextUrl.pathname,
    method: request.method,
  };
  const { currency } = resolveLocaleAndCurrency(request);

  const meta = {
    ...baseMeta,
    currency,
  };

  let body: unknown;

  try {
    body = await request.json();
  } catch (error) {
    logWarn('cart_rehydrate_payload_parse_failed', {
      ...meta,
      code: 'INVALID_PAYLOAD',
      reason: error instanceof Error ? error.message : String(error),
    });

    return jsonError(400, 'INVALID_PAYLOAD', 'Unable to process cart data.');
  }

  const normalizedBody = normalizeCartPayload(body);
  const parsedPayload = cartRehydratePayloadSchema.safeParse(normalizedBody);

  if (!parsedPayload.success) {
    logWarn('cart_rehydrate_invalid_payload', {
      ...meta,
      code: 'INVALID_PAYLOAD',
      issuesCount: parsedPayload.error.issues?.length ?? 0,
    });

    return jsonError(400, 'INVALID_PAYLOAD', 'Invalid cart payload', {
      issues: parsedPayload.error.format(),
    });
  }

  try {
    const { items } = parsedPayload.data;
    const parsedResult = await rehydrateCartItems(items, currency);

    // Success signal (avoid noise on empty carts)
    if (Array.isArray(items) && items.length > 0) {
      logInfo('cart_rehydrate_completed', {
        ...meta,
        code: 'OK',
        itemsCount: items.length,
        durationMs: Date.now() - startedAtMs,
      });
    }

    return NextResponse.json(parsedResult);
  } catch (error) {
    // Missing price for locale currency is a CONTRACT error (4xx), but must be traceable.
    if (error instanceof PriceConfigError) {
      logWarn('cart_rehydrate_price_config_error', {
        ...meta,
        code: error.code,
        productId: error.productId,
        currency: error.currency,
      });

      return jsonError(400, error.code, error.message, {
        productId: error.productId,
        currency: error.currency,
      });
    }

    // Client/business rejection (4xx) must be traceable as warn (not error).
    if (error instanceof InvalidPayloadError) {
      logWarn('cart_rehydrate_rejected', {
        ...meta,
        code: error.code,
      });

      return jsonError(400, error.code, error.message);
    }

    // DB misconfiguration / invalid stored money => 500 with stable code.
    if (error instanceof MoneyValueError) {
      logError('cart_rehydrate_price_data_error', error, {
        ...meta,
        code: 'PRICE_DATA_ERROR',
        productId: error.productId,
        field: error.field,
        rawValue: error.rawValue,
      });

      return jsonError(
        500,
        'PRICE_DATA_ERROR',
        'Invalid stored price data for one or more products.',
        {
          productId: error.productId,
          field: error.field,
          rawValue: error.rawValue,
        }
      );
    }

    logError('cart_rehydrate_failed', error, {
      ...meta,
      code: 'CART_REHYDRATE_FAILED',
    });

    return jsonError(500, 'INTERNAL_ERROR', 'Unable to rehydrate cart.');
  }
}
