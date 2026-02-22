import 'server-only';

import { resolveCurrencyFromLocale, type CurrencyCode } from '@/lib/shop/currency';

export type ShippingAvailabilityReasonCode =
  | 'OK'
  | 'SHOP_SHIPPING_DISABLED'
  | 'NP_DISABLED'
  | 'COUNTRY_NOT_SUPPORTED'
  | 'CURRENCY_NOT_SUPPORTED';

export type ShippingAvailabilityInput = {
  shippingEnabled: boolean;
  npEnabled: boolean;
  locale: string | null;
  country: string | null;
  currency: CurrencyCode;
};

export type ShippingAvailabilityDecision = {
  available: boolean;
  reasonCode: ShippingAvailabilityReasonCode;
  normalized: {
    locale: string | null;
    country: string | null;
    currency: CurrencyCode;
  };
};

function normalizeLocale(input: string | null | undefined): string | null {
  const raw = (input ?? '').trim().toLowerCase();
  if (!raw) return null;
  return raw;
}

function normalizeCountry(input: string | null | undefined): string | null {
  const raw = (input ?? '').trim().toUpperCase();
  if (!raw) return null;
  return raw;
}

function inferCountryFromLocale(locale: string | null): string | null {
  if (!locale) return null;
  const primary = locale.split(/[-_]/)[0]?.toLowerCase() ?? '';
  if (primary === 'uk') return 'UA';
  return null;
}

export function resolveShippingAvailability(
  input: ShippingAvailabilityInput
): ShippingAvailabilityDecision {
  const locale = normalizeLocale(input.locale);
  const country = normalizeCountry(input.country) ?? inferCountryFromLocale(locale);
  const currency = input.currency ?? resolveCurrencyFromLocale(locale);

  if (!input.shippingEnabled) {
    return {
      available: false,
      reasonCode: 'SHOP_SHIPPING_DISABLED',
      normalized: { locale, country, currency },
    };
  }

  if (!input.npEnabled) {
    return {
      available: false,
      reasonCode: 'NP_DISABLED',
      normalized: { locale, country, currency },
    };
  }

  if (country !== 'UA') {
    return {
      available: false,
      reasonCode: 'COUNTRY_NOT_SUPPORTED',
      normalized: { locale, country, currency },
    };
  }

  if (currency !== 'UAH') {
    return {
      available: false,
      reasonCode: 'CURRENCY_NOT_SUPPORTED',
      normalized: { locale, country, currency },
    };
  }

  return {
    available: true,
    reasonCode: 'OK',
    normalized: { locale, country, currency },
  };
}
