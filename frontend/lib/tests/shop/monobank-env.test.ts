import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetEnvCache } from '@/lib/env';
import { getMonobankConfig, requireMonobankToken } from '@/lib/env/monobank';

const ENV_KEYS = [
  'MONO_MERCHANT_TOKEN',
  'MONO_WEBHOOK_MODE',
  'MONO_REFUND_ENABLED',
  'MONO_INVOICE_VALIDITY_SECONDS',
  'MONO_TIME_SKEW_TOLERANCE_SEC',
  'MONO_PUBLIC_KEY',
  'MONO_API_BASE',
  'MONO_INVOICE_TIMEOUT_MS',
  'SHOP_BASE_URL',
  'NEXT_PUBLIC_SITE_URL',
  'APP_ORIGIN',
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

describe('monobank env config', () => {
  it('uses defaults when MONO_* values are missing', () => {
    const config = getMonobankConfig();

    expect(config.webhookMode).toBe('apply');
    expect(config.refundEnabled).toBe(false);
    expect(config.invoiceValiditySeconds).toBe(86400);
    expect(config.timeSkewToleranceSec).toBe(300);
    expect(config.baseUrlSource).toBe('unknown');
  });

  it('reports baseUrlSource when SHOP_BASE_URL is set', () => {
    vi.stubEnv('SHOP_BASE_URL', 'https://shop.example.test');
    resetEnvCache();

    const config = getMonobankConfig();
    expect(config.baseUrlSource).toBe('shop_base_url');
  });

  it('throws when monobank token is missing', () => {
    expect(() => requireMonobankToken()).toThrow(
      'MONO_MERCHANT_TOKEN is required'
    );
  });

  it('returns token when MONO_MERCHANT_TOKEN is set', () => {
    vi.stubEnv('MONO_MERCHANT_TOKEN', 'mono_token');
    resetEnvCache();

    expect(requireMonobankToken()).toBe('mono_token');
  });
});
