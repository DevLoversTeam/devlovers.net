import crypto from 'node:crypto';

import { NextRequest } from 'next/server';

import {
  getShopShippingFlags,
  NovaPoshtaConfigError,
} from '@/lib/env/nova-poshta';
import { readPositiveIntEnv } from '@/lib/env/readPositiveIntEnv';
import { getRequestId } from '@/lib/http/getRequestId';
import { logError, logWarn } from '@/lib/logging';
import {
  enforceRateLimit,
  getRateLimitSubject,
  rateLimitResponse,
} from '@/lib/security/rate-limit';
import { resolveShippingAvailability } from '@/lib/services/shop/shipping/availability';
import {
  sanitizeShippingErrorForLog,
  sanitizeShippingLogMeta,
} from '@/lib/services/shop/shipping/log-sanitizer';
import { findWarehousesWithCacheOnMiss } from '@/lib/services/shop/shipping/nova-poshta-catalog';
import { NovaPoshtaApiError } from '@/lib/services/shop/shipping/nova-poshta-client';
import {
  resolveStandardStorefrontCurrency,
  resolveStandardStorefrontShippingCountry,
} from '@/lib/shop/commercial-policy';
import { resolveRequestLocale } from '@/lib/shop/request-locale';
import { shippingWarehousesQuerySchema } from '@/lib/validation/shop-shipping';

import { cachedShippingJson, noStoreShippingJson } from '../../_responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  const baseMeta = {
    requestId,
    route: request.nextUrl.pathname,
    method: request.method,
  };

  const limit = readPositiveIntEnv(
    'SHOP_SHIPPING_WAREHOUSES_RATE_LIMIT_MAX',
    60
  );
  const windowSeconds = readPositiveIntEnv(
    'SHOP_SHIPPING_WAREHOUSES_RATE_LIMIT_WINDOW_SECONDS',
    60
  );
  const decision = await enforceRateLimit({
    key: `shop_shipping_np_warehouses:${getRateLimitSubject(request)}`,
    limit,
    windowSeconds,
  });

  if (!decision.ok) {
    logWarn('shop_shipping_np_warehouses_rate_limited', {
      ...baseMeta,
      code: 'RATE_LIMITED',
      retryAfterSeconds: decision.retryAfterSeconds,
    });
    return rateLimitResponse({
      retryAfterSeconds: decision.retryAfterSeconds,
      details: { scope: 'shop_shipping_np_warehouses' },
    });
  }

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = shippingWarehousesQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return noStoreShippingJson(
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
  const currency = parsed.data.currency ?? resolveStandardStorefrontCurrency();
  const flags = getShopShippingFlags();
  const availability = resolveShippingAvailability({
    shippingEnabled: flags.shippingEnabled,
    npEnabled: flags.npEnabled,
    locale,
    country: parsed.data.country ?? resolveStandardStorefrontShippingCountry(),
    currency,
  });

  if (!availability.available) {
    return cachedShippingJson(
      {
        success: true,
        available: false,
        reasonCode: availability.reasonCode,
        items: [],
      },
      requestId,
      'lookup'
    );
  }

  try {
    const items = await findWarehousesWithCacheOnMiss({
      cityRef: parsed.data.cityRef,
      q: parsed.data.q,
      limit: parsed.data.limit,
      runId: crypto.randomUUID(),
    });

    return cachedShippingJson(
      {
        success: true,
        available: true,
        reasonCode: 'OK',
        items,
      },
      requestId,
      'lookup'
    );
  } catch (error) {
    if (error instanceof NovaPoshtaConfigError) {
      return noStoreShippingJson(
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
      logWarn('shop_shipping_np_warehouses_provider_failed', {
        ...baseMeta,
        code: error.code,
      });
      return noStoreShippingJson(
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
      'shop_shipping_np_warehouses_failed',
      sanitizeShippingErrorForLog(error, 'NP warehouses request failed.'),
      {
        ...(sanitizeShippingLogMeta(baseMeta) ?? baseMeta),
        code: 'INTERNAL_ERROR',
      }
    );
    return noStoreShippingJson(
      {
        success: false,
        code: 'INTERNAL_ERROR',
      },
      requestId,
      500
    );
  }
}
