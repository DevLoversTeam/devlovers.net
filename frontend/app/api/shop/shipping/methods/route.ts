import { NextRequest } from 'next/server';

import {
  assertNovaPoshtaProductionLikeReady,
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
  isCheckoutShippingQuoteCurrency,
  resolveCheckoutShippingQuote,
} from '@/lib/services/shop/shipping/checkout-quote';
import {
  sanitizeShippingErrorForLog,
  sanitizeShippingLogMeta,
} from '@/lib/services/shop/shipping/log-sanitizer';
import {
  resolveStandardStorefrontCurrency,
  resolveStandardStorefrontShippingCountry,
} from '@/lib/shop/commercial-policy';
import { resolveRequestLocale } from '@/lib/shop/request-locale';
import { shippingMethodsQuerySchema } from '@/lib/validation/shop-shipping';

import { cachedShippingJson, noStoreShippingJson } from '../_responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ShippingMethod = {
  provider: 'nova_poshta';
  methodCode: 'NP_WAREHOUSE' | 'NP_LOCKER' | 'NP_COURIER';
  title: string;
  amountMinor: number;
  quoteFingerprint: string;
  requiredFields: Array<
    | 'cityRef'
    | 'warehouseRef'
    | 'addressLine1'
    | 'recipientName'
    | 'recipientPhone'
  >;
};

function parseQuery(request: NextRequest) {
  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  return shippingMethodsQuerySchema.safeParse(raw);
}

function getMethods(currency: 'UAH'): ShippingMethod[] {
  const warehouseQuote = resolveCheckoutShippingQuote({
    methodCode: 'NP_WAREHOUSE',
    currency,
  });
  const lockerQuote = resolveCheckoutShippingQuote({
    methodCode: 'NP_LOCKER',
    currency,
  });
  const courierQuote = resolveCheckoutShippingQuote({
    methodCode: 'NP_COURIER',
    currency,
  });

  return [
    {
      provider: 'nova_poshta',
      methodCode: 'NP_WAREHOUSE',
      title: 'Nova Poshta warehouse',
      amountMinor: warehouseQuote.amountMinor,
      quoteFingerprint: warehouseQuote.quoteFingerprint,
      requiredFields: [
        'cityRef',
        'warehouseRef',
        'recipientName',
        'recipientPhone',
      ],
    },
    {
      provider: 'nova_poshta',
      methodCode: 'NP_LOCKER',
      title: 'Nova Poshta parcel locker',
      amountMinor: lockerQuote.amountMinor,
      quoteFingerprint: lockerQuote.quoteFingerprint,
      requiredFields: [
        'cityRef',
        'warehouseRef',
        'recipientName',
        'recipientPhone',
      ],
    },
    {
      provider: 'nova_poshta',
      methodCode: 'NP_COURIER',
      title: 'Nova Poshta courier',
      amountMinor: courierQuote.amountMinor,
      quoteFingerprint: courierQuote.quoteFingerprint,
      requiredFields: [
        'cityRef',
        'addressLine1',
        'recipientName',
        'recipientPhone',
      ],
    },
  ];
}

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request.headers);
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

  try {
    const locale = parsed.data.locale ?? resolveRequestLocale(request);
    const currency =
      parsed.data.currency ?? resolveStandardStorefrontCurrency();
    const flags = getShopShippingFlags();
    const availability = resolveShippingAvailability({
      shippingEnabled: flags.shippingEnabled,
      npEnabled: flags.npEnabled,
      locale,
      country:
        parsed.data.country ?? resolveStandardStorefrontShippingCountry(),
      currency,
    });

    if (!availability.available) {
      return cachedShippingJson(
        {
          success: true,
          available: false,
          reasonCode: availability.reasonCode,
          locale: availability.normalized.locale,
          country: availability.normalized.country,
          currency: availability.normalized.currency,
          methods: [],
        },
        requestId,
        'methods'
      );
    }

    if (!isCheckoutShippingQuoteCurrency(availability.normalized.currency)) {
      return cachedShippingJson(
        {
          success: true,
          available: false,
          reasonCode: 'CURRENCY_NOT_SUPPORTED',
          locale: availability.normalized.locale,
          country: availability.normalized.country,
          currency: availability.normalized.currency,
          methods: [],
        },
        requestId,
        'methods'
      );
    }

    try {
      assertNovaPoshtaProductionLikeReady();
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
      throw error;
    }

    return cachedShippingJson(
      {
        success: true,
        available: true,
        reasonCode: 'OK',
        locale: availability.normalized.locale,
        country: availability.normalized.country,
        currency: availability.normalized.currency,
        methods: getMethods(availability.normalized.currency),
      },
      requestId,
      'methods'
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
