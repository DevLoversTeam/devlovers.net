import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetEnvCache } from '@/lib/env';
import { getMonobankEnv } from '@/lib/env/monobank';
import { getNovaPoshtaConfig } from '@/lib/env/nova-poshta';
import { resolveShopPaymentProvider } from '@/lib/env/payments';
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

function seedPlaceholderNovaPoshtaEnv() {
  vi.stubEnv('SHOP_SHIPPING_ENABLED', 'true');
  vi.stubEnv('SHOP_SHIPPING_NP_ENABLED', 'true');
  vi.stubEnv('NP_API_BASE', 'https://api.example.test');
  vi.stubEnv('NP_API_KEY', 'np_test_placeholder');
  vi.stubEnv('NP_SENDER_CITY_REF', 'test-city-ref');
  vi.stubEnv('NP_SENDER_WAREHOUSE_REF', 'test-warehouse-ref');
  vi.stubEnv('NP_SENDER_REF', 'test-sender-ref');
  vi.stubEnv('NP_SENDER_CONTACT_REF', 'test-contact-ref');
  vi.stubEnv('NP_SENDER_NAME', 'Test Sender');
  vi.stubEnv('NP_SENDER_PHONE', '0000000000');
}

beforeEach(() => {
  vi.unstubAllEnvs();
  for (const key of ENV_KEYS) {
    vi.stubEnv(key, undefined);
  }
  resetEnvCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe('shop provider runtime env safety', () => {
  it('rejects placeholder stripe config in production-like runtime and allows valid live config', () => {
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('PAYMENTS_ENABLED', 'true');
    vi.stubEnv('STRIPE_MODE', 'live');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_placeholder');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_placeholder');
    vi.stubEnv('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'pk_test_placeholder');
    resetEnvCache();

    expect(() => getStripeEnv()).toThrow(
      /STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY|STRIPE_MODE/
    );

    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_1234567890abcdef');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_1234567890abcdef');
    vi.stubEnv('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'pk_live_1234567890abcdef');
    resetEnvCache();

    expect(getStripeEnv()).toMatchObject({
      paymentsEnabled: true,
      mode: 'live',
      secretKey: 'sk_live_1234567890abcdef',
      webhookSecret: 'whsec_1234567890abcdef',
      publishableKey: 'pk_live_1234567890abcdef',
    });
  });

  it('rejects a production-like stripe live/test mismatch when webhook validation is otherwise present', () => {
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('PAYMENTS_ENABLED', 'true');
    vi.stubEnv('STRIPE_MODE', 'live');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_1234567890abcdef');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_1234567890abcdef');
    vi.stubEnv('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'pk_live_1234567890abcdef');
    resetEnvCache();

    expect(() => getStripeEnv()).toThrow(/STRIPE_SECRET_KEY/);
  });

  it('keeps local/test stripe workflow usable with test keys', () => {
    vi.stubEnv('APP_ENV', 'local');
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('PAYMENTS_ENABLED', 'true');
    vi.stubEnv('STRIPE_MODE', 'test');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_local_checkout');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_local_checkout');
    vi.stubEnv('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'pk_test_local_checkout');
    resetEnvCache();

    expect(getStripeEnv()).toMatchObject({
      paymentsEnabled: true,
      mode: 'test',
      secretKey: 'sk_test_local_checkout',
    });
  });

  it('rejects placeholder monobank config in production-like runtime and keeps local/test usable', () => {
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('PAYMENTS_ENABLED', 'true');
    vi.stubEnv('MONO_MERCHANT_TOKEN', 'mono_test_placeholder');
    vi.stubEnv('MONO_PUBLIC_KEY', 'mono_test_public');
    vi.stubEnv('MONO_API_BASE', 'https://api.example.test');
    resetEnvCache();

    expect(() => getMonobankEnv()).toThrow(
      /MONO_MERCHANT_TOKEN|MONO_PUBLIC_KEY|MONO_API_BASE/
    );

    vi.stubEnv('APP_ENV', 'local');
    resetEnvCache();

    expect(getMonobankEnv()).toMatchObject({
      paymentsEnabled: true,
      token: 'mono_test_placeholder',
      apiBaseUrl: 'https://api.example.test',
    });
  });

  it('treats invalid monobank runtime config as disabled in generic provider resolution', () => {
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('PAYMENTS_ENABLED', 'true');
    vi.stubEnv('MONO_MERCHANT_TOKEN', 'mono_test_placeholder');
    vi.stubEnv('MONO_PUBLIC_KEY', 'mono_test_public');
    vi.stubEnv('MONO_API_BASE', 'https://api.example.test');
    resetEnvCache();

    expect(() => resolveShopPaymentProvider()).not.toThrow();
    expect(resolveShopPaymentProvider()).toBe('none');
  });

  it('rejects placeholder nova poshta config in production-like runtime and keeps local/test usable', () => {
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('NODE_ENV', 'test');
    seedPlaceholderNovaPoshtaEnv();
    resetEnvCache();

    expect(() => getNovaPoshtaConfig()).toThrow(/NP_/);

    vi.stubEnv('APP_ENV', 'local');
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
