import { describe, expect, it } from 'vitest';

import { PriceConfigError } from '@/lib/services/errors';
import { assertMergedPricesPolicy } from '@/lib/services/products/prices';

describe('assertMergedPricesPolicy (merged-state)', () => {
  it('allows UAH-only merged state when USD compatibility is not required', () => {
    expect(() =>
      assertMergedPricesPolicy(
        [{ currency: 'UAH', priceMinor: 1000, originalPriceMinor: null }],
        { productId: 'p1', requireUsd: false }
      )
    ).not.toThrow();
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
