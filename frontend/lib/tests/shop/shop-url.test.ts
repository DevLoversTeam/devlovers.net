import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetEnvCache } from '@/lib/env';
import { resolveShopBaseUrl, toAbsoluteUrl } from '@/lib/shop/url';

const ENV_KEYS = [
  'SHOP_BASE_URL',
  'APP_ORIGIN',
  'NEXT_PUBLIC_SITE_URL',
  'NODE_ENV',
];

beforeEach(() => {
  for (const key of ENV_KEYS) {
    vi.stubEnv(key, undefined);
  }
  resetEnvCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe('shop base url helper', () => {
  it('prefers SHOP_BASE_URL over other envs', () => {
    vi.stubEnv('SHOP_BASE_URL', 'https://shop.example.test');
    vi.stubEnv('APP_ORIGIN', 'https://app.example.test');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://public.example.test');
    resetEnvCache();

    expect(resolveShopBaseUrl().origin).toBe('https://shop.example.test');
  });

  it('falls back to APP_ORIGIN when SHOP_BASE_URL is missing', () => {
    vi.stubEnv('APP_ORIGIN', 'https://app.example.test');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://public.example.test');
    resetEnvCache();

    expect(resolveShopBaseUrl().origin).toBe('https://app.example.test');
  });

  it('falls back to NEXT_PUBLIC_SITE_URL when SHOP_BASE_URL and APP_ORIGIN are missing', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://public.example.test');
    resetEnvCache();

    expect(resolveShopBaseUrl().origin).toBe('https://public.example.test');
  });

  it('enforces https in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SHOP_BASE_URL', 'http://example.test');
    resetEnvCache();

    expect(() => resolveShopBaseUrl()).toThrow('https');
  });

  it('joins base url and path safely', () => {
    vi.stubEnv('SHOP_BASE_URL', 'https://x.test');
    resetEnvCache();

    expect(toAbsoluteUrl('/api/shop/webhooks/monobank')).toBe(
      'https://x.test/api/shop/webhooks/monobank'
    );
  });
});
