import crypto from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { getShopShippingFlags, NovaPoshtaConfigError } from '@/lib/env/nova-poshta';
import { readPositiveIntEnv } from '@/lib/env/readPositiveIntEnv';
import { logError, logWarn } from '@/lib/logging';
import { enforceRateLimit, getRateLimitSubject, rateLimitResponse } from '@/lib/security/rate-limit';
import { resolveShippingAvailability } from '@/lib/services/shop/shipping/availability';
import {
  sanitizeShippingErrorForLog,
  sanitizeShippingLogMeta,
} from '@/lib/services/shop/shipping/log-sanitizer';
import { findCitiesWithCacheOnMiss } from '@/lib/services/shop/shipping/nova-poshta-catalog';
import { NovaPoshtaApiError } from '@/lib/services/shop/shipping/nova-poshta-client';
import { resolveCurrencyFromLocale } from '@/lib/shop/currency';
import { resolveRequestLocale } from '@/lib/shop/request-locale';
import { shippingCitiesQuerySchema } from '@/lib/validation/shop-shipping';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function cachedJson(body: unknown, requestId: string) {
  const res = NextResponse.json(body, { status: 200 });
  res.headers.set(
    'Cache-Control',
    'public, max-age=30, s-maxage=60, stale-while-revalidate=120'
  );
  res.headers.set('X-Request-Id', requestId);
  return res;
}

function noStoreJson(body: unknown, requestId: string, status = 200) {
  const res = NextResponse.json(body, { status });
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('X-Request-Id', requestId);
  return res;
}

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id')?.trim() || crypto.randomUUID();
  const baseMeta = {
    requestId,
    route: request.nextUrl.pathname,
    method: request.method,
  };

  const limit = readPositiveIntEnv('SHOP_SHIPPING_CITIES_RATE_LIMIT_MAX', 60);
  const windowSeconds = readPositiveIntEnv(
    'SHOP_SHIPPING_CITIES_RATE_LIMIT_WINDOW_SECONDS',
    60
  );
  const decision = await enforceRateLimit({
    key: `shop_shipping_np_cities:${getRateLimitSubject(request)}`,
    limit,
    windowSeconds,
  });

  if (!decision.ok) {
    logWarn('shop_shipping_np_cities_rate_limited', {
      ...baseMeta,
      code: 'RATE_LIMITED',
      retryAfterSeconds: decision.retryAfterSeconds,
    });
    return rateLimitResponse({
      retryAfterSeconds: decision.retryAfterSeconds,
      details: { scope: 'shop_shipping_np_cities' },
    });
  }

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = shippingCitiesQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return noStoreJson(
      {
        success: false,
        code: 'INVALID_QUERY',
        message: 'Invalid query parameters',
      },
      requestId,
      400
    );
  }

  const locale = parsed.data.locale ?? resolveRequestLocale(request);
  const currency = parsed.data.currency ?? resolveCurrencyFromLocale(locale);
  const flags = getShopShippingFlags();
  const availability = resolveShippingAvailability({
    shippingEnabled: flags.shippingEnabled,
    npEnabled: flags.npEnabled,
    locale,
    country: parsed.data.country ?? null,
    currency,
  });

  if (!availability.available) {
    return cachedJson(
      {
        success: true,
        available: false,
        reasonCode: availability.reasonCode,
        items: [],
      },
      requestId
    );
  }

  try {
    const items = await findCitiesWithCacheOnMiss({
      q: parsed.data.q,
      limit: parsed.data.limit,
      runId: crypto.randomUUID(),
    });

    return cachedJson(
      {
        success: true,
        available: true,
        reasonCode: 'OK',
        items,
      },
      requestId
    );
  } catch (error) {
    if (error instanceof NovaPoshtaConfigError) {
      return noStoreJson(
        {
          success: false,
          code: 'NP_MISCONFIG',
          message: 'Nova Poshta configuration is invalid',
        },
        requestId,
        503
      );
    }
    if (error instanceof NovaPoshtaApiError) {
      logWarn('shop_shipping_np_cities_provider_failed', {
        ...baseMeta,
        code: error.code,
      });
      return noStoreJson(
        {
          success: true,
          available: false,
          reasonCode: 'NP_UNAVAILABLE',
          items: [],
        },
        requestId,
        200
      );
    }

    logError(
      'shop_shipping_np_cities_failed',
      sanitizeShippingErrorForLog(error, 'NP cities request failed.'),
      {
        ...(sanitizeShippingLogMeta(baseMeta) ?? baseMeta),
        code: 'INTERNAL_ERROR',
      }
    );
    return noStoreJson(
      {
        success: false,
        code: 'INTERNAL_ERROR',
      },
      requestId,
      500
    );
  }
}
