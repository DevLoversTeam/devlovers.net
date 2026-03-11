import { beforeEach, describe, expect, it, vi } from 'vitest';

const isStripePaymentsEnabledMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/env/stripe', () => ({
  isPaymentsEnabled: (args?: unknown) => isStripePaymentsEnabledMock(args),
}));

vi.mock('@/app/[locale]/shop/cart/CartPageClient', () => ({
  default: () => null,
}));

describe('cart stripe capability alignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('resolves stripe as disabled when canonical capability is false', async () => {
    isStripePaymentsEnabledMock.mockReturnValue(false);

    const mod = await import('@/app/[locale]/shop/cart/page');
    const enabled = mod.resolveStripeCheckoutEnabled();

    expect(enabled).toBe(false);
    expect(isStripePaymentsEnabledMock).toHaveBeenCalledWith({
      requirePublishableKey: true,
      respectStripePaymentsFlag: true,
    });
  });

  it('resolves stripe as enabled when canonical capability is true', async () => {
    isStripePaymentsEnabledMock.mockReturnValue(true);

    const mod = await import('@/app/[locale]/shop/cart/page');
    const enabled = mod.resolveStripeCheckoutEnabled();

    expect(enabled).toBe(true);
    expect(isStripePaymentsEnabledMock).toHaveBeenCalledWith({
      requirePublishableKey: true,
      respectStripePaymentsFlag: true,
    });
  });
});
