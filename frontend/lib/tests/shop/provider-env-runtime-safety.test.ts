import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetEnvCache } from '@/lib/env';
import { getMonobankEnv } from '@/lib/env/monobank';
import { getNovaPoshtaConfig } from '@/lib/env/nova-poshta';
import { getStripeEnv } from '@/lib/env/stripe';

const ENV_KEYS = [
  'APP_ENV',
  'NODE_ENV',
  'PAYMENTS_ENABLED',
  'STRIPE_MODE',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'MONO_MERCHANT_TOKEN',
  'MONO_PUBLIC_KEY',
  'MONO_API_BASE',
  'SHOP_SHIPPING_ENABLED',
  'SHOP_SHIPPING_NP_ENABLED',
  'NP_API_BASE',
  'NP_API_KEY',
  'NP_SENDER_CITY_REF',
  'NP_SENDER_WAREHOUSE_REF',
  'NP_SENDER_REF',
  'NP_SENDER_CONTACT_REF',
  'NP_SENDER_NAME',
  'NP_SENDER_PHONE',
  'NP_SENDER_EDRPOU',
];

const previousEnv: Record<string, string | undefined> = {};

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = previousEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function seedPlaceholderNovaPoshtaEnv() {
  process.env.SHOP_SHIPPING_ENABLED = 'true';
  process.env.SHOP_SHIPPING_NP_ENABLED = 'true';
  process.env.NP_API_BASE = 'https://api.example.test';
  process.env.NP_API_KEY = 'np_test_placeholder';
  process.env.NP_SENDER_CITY_REF = 'test-city-ref';
  process.env.NP_SENDER_WAREHOUSE_REF = 'test-warehouse-ref';
  process.env.NP_SENDER_REF = 'test-sender-ref';
  process.env.NP_SENDER_CONTACT_REF = 'test-contact-ref';
  process.env.NP_SENDER_NAME = 'Test Sender';
  process.env.NP_SENDER_PHONE = '0000000000';
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    previousEnv[key] = process.env[key];
    delete process.env[key];
  }
  vi.unstubAllEnvs();
  resetEnvCache();
});

afterEach(() => {
  restoreEnv();
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe('shop provider runtime env safety', () => {
  it('rejects placeholder stripe config in production-like runtime and allows valid live config', () => {
    process.env.APP_ENV = 'production';
    vi.stubEnv('NODE_ENV', 'test');
    process.env.PAYMENTS_ENABLED = 'true';
    process.env.STRIPE_MODE = 'live';
    process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_placeholder';
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_placeholder';
    resetEnvCache();

    expect(() => getStripeEnv()).toThrow(
      /STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY|STRIPE_MODE/
    );

    process.env.STRIPE_SECRET_KEY = 'sk_live_1234567890abcdef';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_1234567890abcdef';
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_live_1234567890abcdef';
    resetEnvCache();

    expect(getStripeEnv()).toMatchObject({
      paymentsEnabled: true,
      mode: 'live',
      secretKey: 'sk_live_1234567890abcdef',
      webhookSecret: 'whsec_1234567890abcdef',
      publishableKey: 'pk_live_1234567890abcdef',
    });
  });

  it('keeps local/test stripe workflow usable with test keys', () => {
    process.env.APP_ENV = 'local';
    vi.stubEnv('NODE_ENV', 'test');
    process.env.PAYMENTS_ENABLED = 'true';
    process.env.STRIPE_MODE = 'test';
    process.env.STRIPE_SECRET_KEY = 'sk_test_local_checkout';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_local_checkout';
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_local_checkout';
    resetEnvCache();

    expect(getStripeEnv()).toMatchObject({
      paymentsEnabled: true,
      mode: 'test',
      secretKey: 'sk_test_local_checkout',
    });
  });

  it('rejects placeholder monobank config in production-like runtime and keeps local/test usable', () => {
    process.env.APP_ENV = 'production';
    vi.stubEnv('NODE_ENV', 'test');
    process.env.PAYMENTS_ENABLED = 'true';
    process.env.MONO_MERCHANT_TOKEN = 'mono_test_placeholder';
    process.env.MONO_PUBLIC_KEY = 'mono_test_public';
    process.env.MONO_API_BASE = 'https://api.example.test';
    resetEnvCache();

    expect(() => getMonobankEnv()).toThrow(
      /MONO_MERCHANT_TOKEN|MONO_PUBLIC_KEY|MONO_API_BASE/
    );

    process.env.APP_ENV = 'local';
    resetEnvCache();

    expect(getMonobankEnv()).toMatchObject({
      paymentsEnabled: true,
      token: 'mono_test_placeholder',
      apiBaseUrl: 'https://api.example.test',
    });
  });

  it('rejects placeholder nova poshta config in production-like runtime and keeps local/test usable', () => {
    process.env.APP_ENV = 'production';
    vi.stubEnv('NODE_ENV', 'test');
    seedPlaceholderNovaPoshtaEnv();
    resetEnvCache();

    expect(() => getNovaPoshtaConfig()).toThrow(/NP_/);

    process.env.APP_ENV = 'local';
    resetEnvCache();

    expect(getNovaPoshtaConfig()).toMatchObject({
      enabled: true,
      apiBaseUrl: 'https://api.example.test',
      apiKey: 'np_test_placeholder',
      sender: {
        cityRef: 'test-city-ref',
        warehouseRef: 'test-warehouse-ref',
      },
    });
  });
});
