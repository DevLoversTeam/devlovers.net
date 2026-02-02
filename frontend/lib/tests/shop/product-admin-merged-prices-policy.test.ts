import { describe, expect, it } from 'vitest';
import { assertMergedPricesPolicy } from '@/lib/services/products/prices';
import { PriceConfigError } from '@/lib/services/errors';

describe('assertMergedPricesPolicy (merged-state)', () => {
  it('throws PRICE_CONFIG_ERROR when USD is missing after merge', () => {
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

  it('passes when USD exists in merged state', () => {
    expect(() =>
      assertMergedPricesPolicy(
        [
          { currency: 'UAH', priceMinor: 1000, originalPriceMinor: null },
          { currency: 'USD', priceMinor: 500, originalPriceMinor: null },
        ],
        { productId: 'p1', requireUsd: true }
      )
    ).not.toThrow();
  });
});
