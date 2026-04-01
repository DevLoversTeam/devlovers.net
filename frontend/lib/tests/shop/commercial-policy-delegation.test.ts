import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('commercial policy wrapper delegation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('currency and locale helpers delegate to the centralized policy module', async () => {
    const currencyDelegate = vi.fn(() => 'USD');
    const countryDelegate = vi.fn(() => 'UA');

    vi.doMock('@/lib/shop/commercial-policy', async () => {
      const actual = await vi.importActual<any>('@/lib/shop/commercial-policy');
      return {
        ...actual,
        resolveCurrentStandardStorefrontCurrencyFromLocale: currencyDelegate,
        resolveCurrentStandardStorefrontShippingCountryFromLocale:
          countryDelegate,
      };
    });

    const currencyMod = await import('@/lib/shop/currency');
    const localeMod = await import('@/lib/shop/locale');

    expect(currencyMod.resolveCurrencyFromLocale('uk')).toBe('USD');
    expect(currencyDelegate).toHaveBeenCalledWith('uk');

    expect(localeMod.localeToCountry('uk')).toBe('UA');
    expect(countryDelegate).toHaveBeenCalledWith('uk');
  });

  it('checkout provider helper delegates to the centralized policy module', async () => {
    const candidateDelegate = vi.fn(() => ['stripe'] as const);

    vi.doMock('@/lib/shop/commercial-policy', async () => {
      const actual = await vi.importActual<any>('@/lib/shop/commercial-policy');
      return {
        ...actual,
        resolveCurrentCheckoutProviderCandidates: candidateDelegate,
      };
    });

    const paymentsMod = await import('@/lib/shop/payments');

    expect(
      paymentsMod.resolveCheckoutProviderCandidates({
        currency: 'UAH',
      })
    ).toEqual(['stripe']);
    expect(candidateDelegate).toHaveBeenCalledWith({
      currency: 'UAH',
    });
  });

  it('cart capability helpers delegate to the centralized server policy module', async () => {
    const resolveCapabilities = vi.fn(() => ({
      stripeCheckoutEnabled: true,
      monobankCheckoutEnabled: false,
      monobankGooglePayEnabled: false,
      enabledProviders: ['stripe'] as const,
    }));

    vi.doMock('@/lib/shop/commercial-policy.server', () => ({
      resolveStandardStorefrontProviderCapabilities: resolveCapabilities,
    }));

    const mod = await import('@/app/[locale]/shop/cart/capabilities');

    expect(mod.resolveStripeCheckoutEnabled()).toBe(true);
    expect(mod.resolveMonobankCheckoutEnabled()).toBe(false);
    expect(mod.resolveMonobankGooglePayEnabled()).toBe(false);
    expect(resolveCapabilities).toHaveBeenCalledTimes(3);
  });
});
