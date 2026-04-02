import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetEnvCache } from '@/lib/env';

const enforceRateLimitMock = vi.fn();

vi.mock('@/lib/security/rate-limit', () => ({
  getRateLimitSubject: vi.fn(() => 'shipping_methods_subject'),
  enforceRateLimit: (...args: any[]) => enforceRateLimitMock(...args),
  rateLimitResponse: ({ retryAfterSeconds }: { retryAfterSeconds: number }) => {
    const res = NextResponse.json(
      {
        success: false,
        code: 'RATE_LIMITED',
        retryAfterSeconds,
      },
      { status: 429 }
    );
    res.headers.set('Retry-After', String(retryAfterSeconds));
    res.headers.set('Cache-Control', 'no-store');
    return res;
  },
}));

vi.mock('@/lib/logging', () => ({
  logWarn: vi.fn(),
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

const { GET } = await import('@/app/api/shop/shipping/methods/route');

describe('shop shipping methods route (phase 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    resetEnvCache();
    enforceRateLimitMock.mockResolvedValue({ ok: true, remaining: 100 });
  });

  it('returns 200 + available=false when shipping feature is disabled', async () => {
    vi.stubEnv('SHOP_SHIPPING_ENABLED', 'false');
    vi.stubEnv('SHOP_SHIPPING_NP_ENABLED', 'false');

    const req = new NextRequest(
      'http://localhost/api/shop/shipping/methods?locale=uk'
    );
    const res = await GET(req);
    const json: any = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      available: false,
      reasonCode: 'SHOP_SHIPPING_DISABLED',
      methods: [],
    });
  });

  it('returns 200 + available=false when NP is disabled but shipping is enabled', async () => {
    vi.stubEnv('SHOP_SHIPPING_ENABLED', 'true');
    vi.stubEnv('SHOP_SHIPPING_NP_ENABLED', 'false');

    const req = new NextRequest(
      'http://localhost/api/shop/shipping/methods?locale=uk'
    );
    const res = await GET(req);
    const json: any = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      available: false,
      reasonCode: 'NP_DISABLED',
      methods: [],
    });
  });

  it('returns 200 + available=false when checkout currency is unsupported', async () => {
    vi.stubEnv('SHOP_SHIPPING_ENABLED', 'true');
    vi.stubEnv('SHOP_SHIPPING_NP_ENABLED', 'true');
    vi.stubEnv('SHOP_SHIPPING_NP_WAREHOUSE_AMOUNT_MINOR', '500');
    vi.stubEnv('SHOP_SHIPPING_NP_LOCKER_AMOUNT_MINOR', '400');
    vi.stubEnv('SHOP_SHIPPING_NP_COURIER_AMOUNT_MINOR', '700');

    const req = new NextRequest(
      'http://localhost/api/shop/shipping/methods?locale=en&country=UA&currency=USD'
    );
    const res = await GET(req);
    const json: any = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      available: false,
      reasonCode: 'CURRENCY_NOT_SUPPORTED',
      currency: 'USD',
      methods: [],
    });
  });

  it('returns authoritative shipping amounts and quote fingerprints when shipping is available', async () => {
    vi.stubEnv('SHOP_SHIPPING_ENABLED', 'true');
    vi.stubEnv('SHOP_SHIPPING_NP_ENABLED', 'true');
    vi.stubEnv('SHOP_SHIPPING_NP_WAREHOUSE_AMOUNT_MINOR', '500');
    vi.stubEnv('SHOP_SHIPPING_NP_LOCKER_AMOUNT_MINOR', '400');
    vi.stubEnv('SHOP_SHIPPING_NP_COURIER_AMOUNT_MINOR', '700');

    const req = new NextRequest(
      'http://localhost/api/shop/shipping/methods?locale=uk&currency=UAH&country=UA'
    );
    const res = await GET(req);
    const json: any = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      available: true,
      reasonCode: 'OK',
      currency: 'UAH',
    });
    expect(Array.isArray(json.methods)).toBe(true);
    expect(json.methods).toHaveLength(3);

    for (const method of json.methods) {
      expect(method.provider).toBe('nova_poshta');
      expect(method.methodCode).toMatch(/^NP_(WAREHOUSE|LOCKER|COURIER)$/);
      expect(Number.isInteger(method.amountMinor)).toBe(true);
      expect(method.amountMinor).toBeGreaterThanOrEqual(0);
      expect(method.quoteFingerprint).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('uses the standard storefront UA + UAH policy for en locale requests when query policy fields are omitted', async () => {
    vi.stubEnv('SHOP_SHIPPING_ENABLED', 'true');
    vi.stubEnv('SHOP_SHIPPING_NP_ENABLED', 'true');
    vi.stubEnv('SHOP_SHIPPING_NP_WAREHOUSE_AMOUNT_MINOR', '500');
    vi.stubEnv('SHOP_SHIPPING_NP_LOCKER_AMOUNT_MINOR', '400');
    vi.stubEnv('SHOP_SHIPPING_NP_COURIER_AMOUNT_MINOR', '700');

    const req = new NextRequest(
      'http://localhost/api/shop/shipping/methods?locale=en'
    );
    const res = await GET(req);
    const json: any = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      available: true,
      reasonCode: 'OK',
      country: 'UA',
      currency: 'UAH',
    });
    expect(json.methods).toHaveLength(3);
  });

  it('fails closed with NP_MISCONFIG in production-like runtime when NP config is placeholder', async () => {
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('SHOP_SHIPPING_ENABLED', 'true');
    vi.stubEnv('SHOP_SHIPPING_NP_ENABLED', 'true');
    vi.stubEnv('SHOP_SHIPPING_NP_WAREHOUSE_AMOUNT_MINOR', '500');
    vi.stubEnv('SHOP_SHIPPING_NP_LOCKER_AMOUNT_MINOR', '400');
    vi.stubEnv('SHOP_SHIPPING_NP_COURIER_AMOUNT_MINOR', '700');
    vi.stubEnv('NP_API_BASE', 'https://api.example.test');
    vi.stubEnv('NP_API_KEY', 'np_test_placeholder');
    vi.stubEnv('NP_SENDER_CITY_REF', 'test-city-ref');
    vi.stubEnv('NP_SENDER_WAREHOUSE_REF', 'test-warehouse-ref');
    vi.stubEnv('NP_SENDER_REF', 'test-sender-ref');
    vi.stubEnv('NP_SENDER_CONTACT_REF', 'test-contact-ref');
    vi.stubEnv('NP_SENDER_NAME', 'Test Sender');
    vi.stubEnv('NP_SENDER_PHONE', '0000000000');
    resetEnvCache();

    const req = new NextRequest(
      'http://localhost/api/shop/shipping/methods?locale=uk&currency=UAH&country=UA'
    );
    const res = await GET(req);
    const json: any = await res.json();

    expect(res.status).toBe(503);
    expect(json).toMatchObject({
      success: false,
      code: 'NP_MISCONFIG',
      message: 'Nova Poshta configuration is invalid',
    });
  });
});
