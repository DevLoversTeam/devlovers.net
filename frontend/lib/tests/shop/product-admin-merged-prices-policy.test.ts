import { describe, expect, it } from 'vitest';

import { PriceConfigError } from '@/lib/services/errors';
import { assertMergedPricesPolicy } from '@/lib/services/products/prices';

describe('assertMergedPricesPolicy (merged-state)', () => {
  it('allows UAH-only merged state when the standard storefront currency is present', () => {
    expect(() =>
      assertMergedPricesPolicy(
        [{ currency: 'UAH', priceMinor: 1000, originalPriceMinor: null }],
        { productId: 'p1', requiredCurrency: 'UAH', requireUsd: false }
      )
    ).not.toThrow();
  });

  it('throws PRICE_CONFIG_ERROR when the standard storefront currency is missing from merged state', () => {
    try {
      assertMergedPricesPolicy(
        [{ currency: 'USD', priceMinor: 1000, originalPriceMinor: null }],
        { productId: 'p1', requiredCurrency: 'UAH', requireUsd: false }
      );
      throw new Error('Expected PriceConfigError');
    } catch (e) {
      expect(e).toBeInstanceOf(PriceConfigError);
      expect((e as any).code).toBe('PRICE_CONFIG_ERROR');
      expect((e as any).currency).toBe('UAH');
    }
  });

  it('still throws PRICE_CONFIG_ERROR when explicit USD compatibility is required', () => {
    try {
      assertMergedPricesPolicy(
        [{ currency: 'UAH', priceMinor: 1000, originalPriceMinor: null }],
        { productId: 'p1', requireUsd: true }
      );
      throw new Error('Expected PriceConfigError');
    } catch (e) {
      expect(e).toBeInstanceOf(PriceConfigError);
      expect((e as any).code).toBe('PRICE_CONFIG_ERROR');
    }
  });
});
