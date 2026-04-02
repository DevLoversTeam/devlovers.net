import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const COMMERCIAL_POLICY_MODULE_ID = '@/lib/shop/commercial-policy';
const COMMERCIAL_POLICY_SERVER_MODULE_ID =
  '@/lib/shop/commercial-policy.server';

describe('commercial policy wrapper delegation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.doUnmock(COMMERCIAL_POLICY_MODULE_ID);
    vi.doUnmock(COMMERCIAL_POLICY_SERVER_MODULE_ID);
  });

  afterEach(() => {
    vi.doUnmock(COMMERCIAL_POLICY_MODULE_ID);
    vi.doUnmock(COMMERCIAL_POLICY_SERVER_MODULE_ID);
  });

  it('currency and locale helpers delegate to the centralized policy module', async () => {
    const currencyDelegate = vi.fn(() => 'USD');
    const countryDelegate = vi.fn(() => 'UA');

    vi.doMock(COMMERCIAL_POLICY_MODULE_ID, async () => {
      const actual = await vi.importActual<any>(COMMERCIAL_POLICY_MODULE_ID);
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

    vi.doMock(COMMERCIAL_POLICY_MODULE_ID, async () => {
      const actual = await vi.importActual<any>(COMMERCIAL_POLICY_MODULE_ID);
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

    vi.doMock(COMMERCIAL_POLICY_SERVER_MODULE_ID, () => ({
      resolveStandardStorefrontProviderCapabilities: resolveCapabilities,
    }));

    const mod = await import('@/app/[locale]/shop/cart/capabilities');

    expect(mod.resolveStripeCheckoutEnabled()).toBe(true);
    expect(mod.resolveMonobankCheckoutEnabled()).toBe(false);
    expect(mod.resolveMonobankGooglePayEnabled()).toBe(false);
    expect(resolveCapabilities).toHaveBeenCalledTimes(3);
  });
});
