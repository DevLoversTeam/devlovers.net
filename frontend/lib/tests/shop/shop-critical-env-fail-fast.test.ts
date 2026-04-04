import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { assertCriticalShopEnv } from '@/lib/env/shop-critical';

const ENV_KEYS = [
  'APP_ENV',
  'DATABASE_URL',
  'DATABASE_URL_LOCAL',
  'SHOP_STRICT_LOCAL_DB',
  'SHOP_REQUIRED_DATABASE_URL_LOCAL',
  'AUTH_SECRET',
  'SHOP_STATUS_TOKEN_SECRET',
  'PAYMENTS_ENABLED',
  'STRIPE_PAYMENTS_ENABLED',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'MONO_MERCHANT_TOKEN',
  'MONO_REFUND_ENABLED',
  'SHOP_MONOBANK_GPAY_ENABLED',
  'SHOP_BASE_URL',
  'APP_ORIGIN',
  'NEXT_PUBLIC_SITE_URL',
  'SHOP_SHIPPING_ENABLED',
  'SHOP_SHIPPING_NP_ENABLED',
  'NP_API_KEY',
  'NP_SENDER_CITY_REF',
  'NP_SENDER_WAREHOUSE_REF',
  'NP_SENDER_REF',
  'NP_SENDER_CONTACT_REF',
  'NP_SENDER_NAME',
  'NP_SENDER_PHONE',
] as const;

const previousEnv: Record<(typeof ENV_KEYS)[number], string | undefined> =
  Object.create(null);

function seedBaselineLocalEnv() {
  process.env.APP_ENV = 'local';
  delete process.env.DATABASE_URL;
  process.env.DATABASE_URL_LOCAL =
    'postgresql://devlovers_local:test@localhost:5432/devlovers_shop_local_clean?sslmode=disable';
  process.env.SHOP_STRICT_LOCAL_DB = '1';
  process.env.SHOP_REQUIRED_DATABASE_URL_LOCAL = process.env.DATABASE_URL_LOCAL;
  process.env.AUTH_SECRET =
    'test_auth_secret_test_auth_secret_test_auth_secret';
  process.env.SHOP_STATUS_TOKEN_SECRET =
    'test_status_token_secret_test_status_token_secret';
  process.env.PAYMENTS_ENABLED = 'false';
  delete process.env.STRIPE_PAYMENTS_ENABLED;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.MONO_MERCHANT_TOKEN;
  delete process.env.MONO_REFUND_ENABLED;
  delete process.env.SHOP_MONOBANK_GPAY_ENABLED;
  delete process.env.SHOP_BASE_URL;
  delete process.env.APP_ORIGIN;
  delete process.env.NEXT_PUBLIC_SITE_URL;
  process.env.SHOP_SHIPPING_ENABLED = 'false';
  process.env.SHOP_SHIPPING_NP_ENABLED = 'false';
  delete process.env.NP_API_KEY;
  delete process.env.NP_SENDER_CITY_REF;
  delete process.env.NP_SENDER_WAREHOUSE_REF;
  delete process.env.NP_SENDER_REF;
  delete process.env.NP_SENDER_CONTACT_REF;
  delete process.env.NP_SENDER_NAME;
  delete process.env.NP_SENDER_PHONE;
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    previousEnv[key] = process.env[key];
    delete process.env[key];
  }
  seedBaselineLocalEnv();
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

  vi.resetModules();
});

describe('shop critical env fail-fast', () => {
  it('does not enforce shop-only env from the shared db bootstrap', async () => {
    delete process.env.AUTH_SECRET;
    delete process.env.SHOP_STATUS_TOKEN_SECRET;

    vi.resetModules();

    await expect(import('@/db')).resolves.toBeDefined();
  });

  it('fails when Stripe is enabled without required server secrets', () => {
    process.env.PAYMENTS_ENABLED = 'true';

    expect(() => assertCriticalShopEnv()).toThrow(/STRIPE_SECRET_KEY/);

    process.env.STRIPE_SECRET_KEY = 'sk_test_checkout_enabled';
    expect(() => assertCriticalShopEnv()).toThrow(/STRIPE_WEBHOOK_SECRET/);
  });

  it('fails when Monobank is required but token or base URL is missing', () => {
    process.env.PAYMENTS_ENABLED = 'true';
    process.env.STRIPE_PAYMENTS_ENABLED = 'false';

    expect(() => assertCriticalShopEnv()).toThrow(/MONO_MERCHANT_TOKEN/);

    process.env.MONO_MERCHANT_TOKEN = 'mono_test_checkout_enabled';
    expect(() => assertCriticalShopEnv()).toThrow(
      /SHOP_BASE_URL, APP_ORIGIN, or NEXT_PUBLIC_SITE_URL must be set/
    );
  });

  it('fails when Nova Poshta shipping is enabled without required sender config', () => {
    process.env.SHOP_SHIPPING_ENABLED = 'true';
    process.env.SHOP_SHIPPING_NP_ENABLED = 'true';

    expect(() => assertCriticalShopEnv()).toThrow(/NP_API_KEY/);
  });

  it('passes when the local critical shop env is fully configured', () => {
    process.env.PAYMENTS_ENABLED = 'true';
    process.env.STRIPE_SECRET_KEY = 'sk_test_checkout_enabled';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_checkout_enabled';
    process.env.SHOP_BASE_URL = 'http://localhost:3000';
    process.env.MONO_MERCHANT_TOKEN = 'mono_test_checkout_enabled';
    process.env.SHOP_SHIPPING_ENABLED = 'true';
    process.env.SHOP_SHIPPING_NP_ENABLED = 'true';
    process.env.NP_API_KEY = 'np_test_checkout_enabled';
    process.env.NP_SENDER_CITY_REF = 'city-ref-12345';
    process.env.NP_SENDER_WAREHOUSE_REF = 'warehouse-ref-12345';
    process.env.NP_SENDER_REF = 'sender-ref-12345';
    process.env.NP_SENDER_CONTACT_REF = 'contact-ref-12345';
    process.env.NP_SENDER_NAME = 'Test Sender';
    process.env.NP_SENDER_PHONE = '+380991112233';

    expect(() => assertCriticalShopEnv()).not.toThrow();
  });
});
