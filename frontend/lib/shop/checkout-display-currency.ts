import { type CurrencyCode, currencyValues } from '@/lib/shop/currency';

import { resolveStandardStorefrontCurrency } from './commercial-policy';

export function resolveCheckoutDisplayCurrency(
  value: string | null | undefined
): CurrencyCode {
  const normalized = (value ?? '').trim().toUpperCase();

  return currencyValues.includes(normalized as CurrencyCode)
    ? (normalized as CurrencyCode)
    : resolveStandardStorefrontCurrency();
}
