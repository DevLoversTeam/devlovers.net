import crypto from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { getShopShippingFlags } from '@/lib/env/nova-poshta';
import { readPositiveIntEnv } from '@/lib/env/readPositiveIntEnv';
import { logError, logWarn } from '@/lib/logging';
import { enforceRateLimit, getRateLimitSubject, rateLimitResponse } from '@/lib/security/rate-limit';
import { resolveCurrencyFromLocale } from '@/lib/shop/currency';
import { resolveRequestLocale } from '@/lib/shop/request-locale';
import { resolveShippingAvailability } from '@/lib/services/shop/shipping/availability';
import {
  sanitizeShippingErrorForLog,
  sanitizeShippingLogMeta,
} from '@/lib/services/shop/shipping/log-sanitizer';
import { shippingMethodsQuerySchema } from '@/lib/validation/shop-shipping';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ShippingMethod = {
  provider: 'nova_poshta';
  methodCode: 'NP_WAREHOUSE' | 'NP_LOCKER' | 'NP_COURIER';
  title: string;
  requiredFields: Array<'cityRef' | 'warehouseRef' | 'addressLine1' | 'recipientName' | 'recipientPhone'>;
};

function cachedJson(body: unknown, requestId: string) {
  const res = NextResponse.json(body, { status: 200 });
  res.headers.set(
    'Cache-Control',
    'public, max-age=60, s-maxage=300, stale-while-revalidate=600'
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

function parseQuery(request: NextRequest) {
  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  return shippingMethodsQuerySchema.safeParse(raw);
}

function getMethods(): ShippingMethod[] {
  return [
    {
      provider: 'nova_poshta',
      methodCode: 'NP_WAREHOUSE',
      title: 'Nova Poshta warehouse',
      requiredFields: ['cityRef', 'warehouseRef', 'recipientName', 'recipientPhone'],
    },
    {
      provider: 'nova_poshta',
      methodCode: 'NP_LOCKER',
      title: 'Nova Poshta parcel locker',
      requiredFields: ['cityRef', 'warehouseRef', 'recipientName', 'recipientPhone'],
    },
    {
      provider: 'nova_poshta',
      methodCode: 'NP_COURIER',
      title: 'Nova Poshta courier',
      requiredFields: ['cityRef', 'addressLine1', 'recipientName', 'recipientPhone'],
    },
  ];
}

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id')?.trim() || crypto.randomUUID();
  const baseMeta = {
    requestId,
    route: request.nextUrl.pathname,
    method: request.method,
  };

  const limit = readPositiveIntEnv('SHOP_SHIPPING_METHODS_RATE_LIMIT_MAX', 120);
  const windowSeconds = readPositiveIntEnv(
    'SHOP_SHIPPING_METHODS_RATE_LIMIT_WINDOW_SECONDS',
    60
  );
  const decision = await enforceRateLimit({
    key: `shop_shipping_methods:${getRateLimitSubject(request)}`,
    limit,
    windowSeconds,
  });

  if (!decision.ok) {
    logWarn('shop_shipping_methods_rate_limited', {
      ...baseMeta,
      code: 'RATE_LIMITED',
      retryAfterSeconds: decision.retryAfterSeconds,
    });
    return rateLimitResponse({
      retryAfterSeconds: decision.retryAfterSeconds,
      details: { scope: 'shop_shipping_methods' },
    });
  }

  const parsed = parseQuery(request);
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

  try {
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
          locale: availability.normalized.locale,
          country: availability.normalized.country,
          currency: availability.normalized.currency,
          methods: [],
        },
        requestId
      );
    }

    return cachedJson(
      {
        success: true,
        available: true,
        reasonCode: 'OK',
        locale: availability.normalized.locale,
        country: availability.normalized.country,
        currency: availability.normalized.currency,
        methods: getMethods(),
      },
      requestId
    );
  } catch (error) {
    logError(
      'shop_shipping_methods_failed',
      sanitizeShippingErrorForLog(error, 'Shipping methods request failed.'),
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
