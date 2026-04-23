import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const readServerEnvMock = vi.hoisted(() => vi.fn());
const ENV_KEYS = [
  'APP_ENV',
  'PAYMENTS_ENABLED',
  'STRIPE_PAYMENTS_ENABLED',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_MODE',
  'MONO_MERCHANT_TOKEN',
  'MONO_PUBLIC_KEY',
  'MONO_API_BASE',
  'MONO_INVOICE_TIMEOUT_MS',
  'MONO_REFUND_ENABLED',
  'MONO_INVOICE_VALIDITY_SECONDS',
  'MONO_TIME_SKEW_TOLERANCE_SEC',
  'SHOP_MONOBANK_GPAY_ENABLED',
  'SHOP_BASE_URL',
  'APP_ORIGIN',
  'NEXT_PUBLIC_SITE_URL',
  'AUTH_SECRET',
  'SHOP_STATUS_TOKEN_SECRET',
  'DATABASE_URL',
  'DATABASE_URL_LOCAL',
] as const;
const previousEnv: Record<(typeof ENV_KEYS)[number], string | undefined> =
  Object.create(null);

function baselineCartEnv(key: string): string | undefined {
  switch (key) {
    case 'PAYMENTS_ENABLED':
      return 'false';
    default:
      return undefined;
  }
}

vi.mock('@/lib/env/server-env', () => ({
  readServerEnv: (key: string) => readServerEnvMock(key),
}));

describe('public cart env contract', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      previousEnv[key] = process.env[key];
      delete process.env[key];
    }
    vi.clearAllMocks();
    vi.resetModules();
    readServerEnvMock.mockImplementation((key: string) =>
      baselineCartEnv(key)
    );
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
      key === 'PAYMENTS_ENABLED' ? 'true' : baselineCartEnv(key)
    );

    const mod = await import('@/app/[locale]/shop/cart/capabilities');
    const enabled = mod.resolveMonobankCheckoutEnabled();

    expect(enabled).toBe(false);
    expect(readServerEnvMock).toHaveBeenCalledWith('PAYMENTS_ENABLED');
    expect(readServerEnvMock).toHaveBeenCalledWith('MONO_MERCHANT_TOKEN');
  });

  it('does not check monobank provider capability when readServerEnv PAYMENTS_ENABLED is disabled', async () => {
    readServerEnvMock.mockImplementation((key: string) =>
      key === 'PAYMENTS_ENABLED' ? 'false' : baselineCartEnv(key)
    );

    const mod = await import('@/app/[locale]/shop/cart/capabilities');
    const enabled = mod.resolveMonobankCheckoutEnabled();

    expect(enabled).toBe(false);
    expect(readServerEnvMock).toHaveBeenCalledWith('PAYMENTS_ENABLED');
    expect(readServerEnvMock).not.toHaveBeenCalledWith('MONO_MERCHANT_TOKEN');
  });

  it('treats normalized truthy env values as enabled for capability resolution', async () => {
    readServerEnvMock.mockImplementation((key: string) => {
      if (key === 'PAYMENTS_ENABLED') return ' YES ';
      if (key === 'SHOP_MONOBANK_GPAY_ENABLED') return ' On ';
      if (key === 'MONO_MERCHANT_TOKEN') return 'mono_live_12345678';
      if (key === 'MONO_PUBLIC_KEY') return 'mono_live_public_12345678';
      if (key === 'MONO_API_BASE') return 'https://api.monobank.ua';
      return baselineCartEnv(key);
    });

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
      if (key === 'MONO_MERCHANT_TOKEN') return 'mono_runtime_only_12345678';
      if (key === 'MONO_PUBLIC_KEY') return 'mono_public_runtime_12345678';
      if (key === 'MONO_API_BASE') return 'https://api.monobank.ua';
      return baselineCartEnv(key);
    });

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
      return baselineCartEnv(key);
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

  it('does not throw when AUTH_SECRET, SHOP_STATUS_TOKEN_SECRET, and database env are absent', async () => {
    readServerEnvMock.mockImplementation((key: string) => {
      if (
        key === 'AUTH_SECRET' ||
        key === 'SHOP_STATUS_TOKEN_SECRET' ||
        key === 'APP_ENV' ||
        key === 'DATABASE_URL' ||
        key === 'DATABASE_URL_LOCAL'
      ) {
        return undefined;
      }
      return baselineCartEnv(key);
    });

    const mod = await import('@/app/[locale]/shop/cart/capabilities');

    expect(() => mod.resolveStripeCheckoutEnabled()).not.toThrow();
    expect(() => mod.resolveMonobankCheckoutEnabled()).not.toThrow();
    expect(() => mod.resolveMonobankGooglePayEnabled()).not.toThrow();
  });

  it('enables stripe capability from runtime-only env when config is valid', async () => {
    readServerEnvMock.mockImplementation((key: string) => {
      switch (key) {
        case 'PAYMENTS_ENABLED':
          return 'true';
        case 'STRIPE_SECRET_KEY':
          return 'sk_test_runtime_only_1234567890';
        case 'STRIPE_WEBHOOK_SECRET':
          return 'whsec_runtime_only_1234567890';
        case 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY':
          return 'pk_test_runtime_only_1234567890';
        default:
          return baselineCartEnv(key);
      }
    });

    const mod = await import('@/app/[locale]/shop/cart/capabilities');

    expect(mod.resolveStripeCheckoutEnabled()).toBe(true);
  });

  it('enables monobank capability from runtime-only env when config is valid', async () => {
    readServerEnvMock.mockImplementation((key: string) => {
      switch (key) {
        case 'PAYMENTS_ENABLED':
          return 'true';
        case 'MONO_MERCHANT_TOKEN':
          return 'mono_runtime_only_12345678';
        case 'MONO_PUBLIC_KEY':
          return 'mono_public_runtime_12345678';
        case 'MONO_API_BASE':
          return 'https://api.monobank.ua';
        case 'SHOP_MONOBANK_GPAY_ENABLED':
          return 'on';
        default:
          return baselineCartEnv(key);
      }
    });

    const mod = await import('@/app/[locale]/shop/cart/capabilities');

    expect(mod.resolveMonobankCheckoutEnabled()).toBe(true);
    expect(mod.resolveMonobankGooglePayEnabled()).toBe(true);
  });

  it('fails closed for stripe capability when runtime-only config is partial or invalid', async () => {
    readServerEnvMock.mockImplementation((key: string) => {
      switch (key) {
        case 'APP_ENV':
          return 'production';
        case 'PAYMENTS_ENABLED':
          return 'true';
        case 'STRIPE_SECRET_KEY':
          return 'sk_test_placeholder';
        case 'STRIPE_WEBHOOK_SECRET':
          return 'whsec_placeholder_value';
        case 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY':
          return 'pk_test_placeholder';
        case 'STRIPE_MODE':
          return 'test';
        default:
          return baselineCartEnv(key);
      }
    });

    const mod = await import('@/app/[locale]/shop/cart/capabilities');

    expect(() => mod.resolveStripeCheckoutEnabled()).not.toThrow();
    expect(mod.resolveStripeCheckoutEnabled()).toBe(false);
  });

  it('fails closed for monobank capability when runtime-only config is partial or invalid', async () => {
    readServerEnvMock.mockImplementation((key: string) => {
      switch (key) {
        case 'APP_ENV':
          return 'production';
        case 'PAYMENTS_ENABLED':
          return 'true';
        case 'MONO_MERCHANT_TOKEN':
          return 'mono_test_placeholder';
        case 'MONO_PUBLIC_KEY':
          return 'mono_test_public';
        case 'MONO_API_BASE':
          return 'https://api.example.test';
        case 'SHOP_MONOBANK_GPAY_ENABLED':
          return 'on';
        default:
          return baselineCartEnv(key);
      }
    });

    const mod = await import('@/app/[locale]/shop/cart/capabilities');

    expect(() => mod.resolveMonobankCheckoutEnabled()).not.toThrow();
    expect(mod.resolveMonobankCheckoutEnabled()).toBe(false);
    expect(() => mod.resolveMonobankGooglePayEnabled()).not.toThrow();
    expect(mod.resolveMonobankGooglePayEnabled()).toBe(false);
  });
});
