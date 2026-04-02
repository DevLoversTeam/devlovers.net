import { describe, expect, it } from 'vitest';

import { resolveCheckoutDisplayCurrency } from '@/lib/shop/checkout-display-currency';

describe('checkout display currency fallback', () => {
  it('falls back to standard storefront UAH when checkout display currency is missing or invalid', () => {
    expect(resolveCheckoutDisplayCurrency(null)).toBe('UAH');
    expect(resolveCheckoutDisplayCurrency('')).toBe('UAH');
    expect(resolveCheckoutDisplayCurrency('invalid')).toBe('UAH');
  });

  it('preserves explicit persisted order currency values for compatibility paths', () => {
    expect(resolveCheckoutDisplayCurrency('USD')).toBe('USD');
    expect(resolveCheckoutDisplayCurrency('UAH')).toBe('UAH');
  });
});
