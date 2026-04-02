import { describe, expect, it } from 'vitest';

import {
  resolveDefaultMethodForProvider,
  resolveInitialProvider,
} from '@/app/[locale]/shop/cart/provider-policy';

describe('cart public provider policy', () => {
  it('does not gate initial Monobank selection on cart currency', () => {
    expect(
      resolveInitialProvider({
        stripeEnabled: false,
        monobankEnabled: true,
        currency: 'USD',
      })
    ).toBe('monobank');
  });

  it('keeps Monobank payment method selection available without cart currency gating', () => {
    expect(
      resolveDefaultMethodForProvider({
        provider: 'monobank',
        currency: 'USD',
      })
    ).toBe('monobank_invoice');
  });
});
