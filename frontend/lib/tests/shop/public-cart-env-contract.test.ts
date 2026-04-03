import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const readServerEnvMock = vi.hoisted(() => vi.fn());
const isMonobankEnabledMock = vi.hoisted(() => vi.fn());
const getMonobankEnvMock = vi.hoisted(() => vi.fn());
const isStripePaymentsEnabledMock = vi.hoisted(() => vi.fn());
const getStripeEnvMock = vi.hoisted(() => vi.fn());
const ENV_KEYS = ['SHOP_BASE_URL'] as const;
const previousEnv: Record<(typeof ENV_KEYS)[number], string | undefined> =
  Object.create(null);

function baselineCriticalEnv(key: string): string | undefined {
  switch (key) {
    case 'APP_ENV':
      return 'local';
    case 'DATABASE_URL_LOCAL':
      return 'postgresql://devlovers_local:test@localhost:5432/devlovers_shop_local_clean?sslmode=disable';
    case 'AUTH_SECRET':
      return 'test_auth_secret_test_auth_secret_test_auth_secret';
    case 'SHOP_STATUS_TOKEN_SECRET':
      return 'test_status_token_secret_test_status_token_secret';
    case 'STRIPE_SECRET_KEY':
      return 'sk_test_checkout_enabled';
    case 'STRIPE_WEBHOOK_SECRET':
      return 'whsec_test_checkout_enabled';
    case 'MONO_MERCHANT_TOKEN':
      return 'mono_test_checkout_enabled';
    default:
      return undefined;
  }
}

vi.mock('@/lib/env/server-env', () => ({
  readServerEnv: (key: string) => readServerEnvMock(key),
}));

vi.mock('@/lib/env/monobank', () => ({
  isMonobankEnabled: () => isMonobankEnabledMock(),
  getMonobankEnv: () => getMonobankEnvMock(),
}));

vi.mock('@/lib/env/stripe', () => ({
  isPaymentsEnabled: (args?: unknown) => isStripePaymentsEnabledMock(args),
  getStripeEnv: () => getStripeEnvMock(),
}));

describe('public cart env contract', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      previousEnv[key] = process.env[key];
    }
    process.env.SHOP_BASE_URL = 'http://localhost:3000';
    vi.clearAllMocks();
    vi.resetModules();
    readServerEnvMock.mockImplementation((key: string) =>
      baselineCriticalEnv(key)
    );
    getStripeEnvMock.mockReturnValue({
      paymentsEnabled: true,
      secretKey: 'sk_test_checkout_enabled',
      webhookSecret: 'whsec_test_checkout_enabled',
      publishableKey: null,
      mode: 'test',
    });
    getMonobankEnvMock.mockReturnValue({
      token: 'mono_test_checkout_enabled',
      apiBaseUrl: 'https://api.monobank.ua',
      paymentsEnabled: true,
      invoiceTimeoutMs: 12000,
      publicKey: null,
    });
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = previousEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('resolves monobank checkout from readServerEnv PAYMENTS_ENABLED before checking provider capability', async () => {
    readServerEnvMock.mockImplementation((key: string) =>
      key === 'PAYMENTS_ENABLED' ? 'true' : baselineCriticalEnv(key)
    );
    isMonobankEnabledMock.mockReturnValue(true);

    const mod = await import('@/app/[locale]/shop/cart/capabilities');
    const enabled = mod.resolveMonobankCheckoutEnabled();

    expect(enabled).toBe(true);
    expect(readServerEnvMock).toHaveBeenCalledWith('PAYMENTS_ENABLED');
    expect(isMonobankEnabledMock).toHaveBeenCalledTimes(1);
  });

  it('does not check monobank provider capability when readServerEnv PAYMENTS_ENABLED is disabled', async () => {
    readServerEnvMock.mockImplementation((key: string) =>
      key === 'PAYMENTS_ENABLED' ? 'false' : baselineCriticalEnv(key)
    );

    const mod = await import('@/app/[locale]/shop/cart/capabilities');
    const enabled = mod.resolveMonobankCheckoutEnabled();

    expect(enabled).toBe(false);
    expect(readServerEnvMock).toHaveBeenCalledWith('PAYMENTS_ENABLED');
    expect(isMonobankEnabledMock).not.toHaveBeenCalled();
  });

  it('treats normalized truthy env values as enabled for capability resolution', async () => {
    readServerEnvMock.mockImplementation((key: string) => {
      if (key === 'PAYMENTS_ENABLED') return ' YES ';
      if (key === 'SHOP_MONOBANK_GPAY_ENABLED') return ' On ';
      return baselineCriticalEnv(key);
    });
    isMonobankEnabledMock.mockReturnValue(true);

    const mod = await import('@/app/[locale]/shop/cart/capabilities');

    expect(mod.resolveMonobankCheckoutEnabled()).toBe(true);
    expect(mod.resolveMonobankGooglePayEnabled()).toBe(true);
    expect(readServerEnvMock).toHaveBeenCalledWith('PAYMENTS_ENABLED');
    expect(readServerEnvMock).toHaveBeenCalledWith(
      'SHOP_MONOBANK_GPAY_ENABLED'
    );
  });

  it('resolves monobank google pay from readServerEnv SHOP_MONOBANK_GPAY_ENABLED', async () => {
    readServerEnvMock.mockImplementation((key: string) => {
      if (key === 'PAYMENTS_ENABLED') return 'true';
      if (key === 'SHOP_MONOBANK_GPAY_ENABLED') return 'on';
      return baselineCriticalEnv(key);
    });
    isMonobankEnabledMock.mockReturnValue(true);

    const mod = await import('@/app/[locale]/shop/cart/capabilities');
    const enabled = mod.resolveMonobankGooglePayEnabled();

    expect(enabled).toBe(true);
    expect(readServerEnvMock).toHaveBeenCalledWith('PAYMENTS_ENABLED');
    expect(readServerEnvMock).toHaveBeenCalledWith(
      'SHOP_MONOBANK_GPAY_ENABLED'
    );
  });

  it('reads legal versions through readServerEnv and keeps existing defaults', async () => {
    readServerEnvMock.mockImplementation((key: string) => {
      if (key === 'SHOP_TERMS_VERSION') return 'terms-v7';
      if (key === 'SHOP_PRIVACY_VERSION') return undefined;
      return baselineCriticalEnv(key);
    });

    const mod = await import('@/lib/env/shop-legal');
    const versions = mod.getShopLegalVersions();

    expect(versions).toEqual({
      termsVersion: 'terms-v7',
      privacyVersion: 'privacy-v1',
    });
    expect(readServerEnvMock).toHaveBeenCalledWith('SHOP_TERMS_VERSION');
    expect(readServerEnvMock).toHaveBeenCalledWith('SHOP_PRIVACY_VERSION');
  });
});
