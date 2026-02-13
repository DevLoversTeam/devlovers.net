import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetEnvCache } from '@/lib/env';
import { resolveShopBaseUrl, toAbsoluteUrl } from '@/lib/shop/url';

const ENV_KEYS = [
  'DATABASE_URL',
  'SHOP_BASE_URL',
  'APP_ORIGIN',
  'NEXT_PUBLIC_SITE_URL',
  'NODE_ENV',
];

const previousEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    previousEnv[key] = process.env[key];
    delete process.env[key];
  }

  process.env.DATABASE_URL = 'https://db.example.test';
  resetEnvCache();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = previousEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetEnvCache();
});

describe('shop base url helper', () => {
  it('prefers SHOP_BASE_URL over other envs', () => {
    process.env.SHOP_BASE_URL = 'https://shop.example.test';
    process.env.APP_ORIGIN = 'https://app.example.test';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://public.example.test';
    resetEnvCache();

    expect(resolveShopBaseUrl().origin).toBe('https://shop.example.test');
  });

  it('falls back to APP_ORIGIN when SHOP_BASE_URL is missing', () => {
    process.env.APP_ORIGIN = 'https://app.example.test';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://public.example.test';
    resetEnvCache();

    expect(resolveShopBaseUrl().origin).toBe('https://app.example.test');
  });

  it('falls back to NEXT_PUBLIC_SITE_URL when SHOP_BASE_URL and APP_ORIGIN are missing', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://public.example.test';
    resetEnvCache();

    expect(resolveShopBaseUrl().origin).toBe('https://public.example.test');
  });

  it('enforces https in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.SHOP_BASE_URL = 'http://example.test';
    resetEnvCache();

    expect(() => resolveShopBaseUrl()).toThrow('https');
  });

  it('joins base url and path safely', () => {
    process.env.SHOP_BASE_URL = 'https://x.test';
    resetEnvCache();

    expect(toAbsoluteUrl('/api/shop/webhooks/monobank')).toBe(
      'https://x.test/api/shop/webhooks/monobank'
    );
  });
});
