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
    vi.stubEnv('DATABASE_URL', 'https://example.com/db');
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
});
