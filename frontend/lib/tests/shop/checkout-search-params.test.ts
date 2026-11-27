import { describe, expect, it } from 'vitest';

import {
  getCheckoutSearchParam,
  parseCheckoutOrderId,
  parseStatusToken,
  shouldClearCart,
} from '@/lib/shop/checkout-search-params';

describe('checkout search params', () => {
  it('reads the first value verbatim and defaults missing values to empty', () => {
    expect(
      getCheckoutSearchParam(
        { clientSecret: [' first ', 'second'] },
        'clientSecret'
      )
    ).toBe(' first ');
    expect(getCheckoutSearchParam({ clientSecret: [] }, 'clientSecret')).toBe(
      ''
    );
    expect(getCheckoutSearchParam(undefined, 'clientSecret')).toBe('');
  });

  it('trims the first status token without falling through to repeated values', () => {
    expect(parseStatusToken({ statusToken: [' token ', 'later'] })).toBe(
      'token'
    );
    expect(parseStatusToken({ statusToken: [' ', 'later'] })).toBeNull();
    expect(parseStatusToken()).toBeNull();
  });

  it('accepts only the exact clear-cart values 1 and true', () => {
    expect(shouldClearCart({ clearCart: ['1', 'false'] })).toBe(true);
    expect(shouldClearCart({ clearCart: 'true' })).toBe(true);
    expect(shouldClearCart({ clearCart: ['false', 'true'] })).toBe(false);
    expect(shouldClearCart({ clearCart: ' true ' })).toBe(false);
    expect(shouldClearCart()).toBe(false);
  });

  it('validates order IDs without trimming them', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(parseCheckoutOrderId(id)).toBe(id);
    expect(parseCheckoutOrderId(' ' + id)).toBeNull();
    expect(parseCheckoutOrderId('invalid')).toBeNull();
    expect(parseCheckoutOrderId()).toBeNull();
  });
});
