import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import { npCities, npWarehouses } from '@/db/schema';
import { resetEnvCache } from '@/lib/env';
import { NovaPoshtaApiError } from '@/lib/services/shop/shipping/nova-poshta-client';

const enforceRateLimitMock = vi.fn();
const getWarehousesBySettlementRefMock = vi.fn();

vi.mock('@/lib/security/rate-limit', () => ({
  getRateLimitSubject: vi.fn(() => 'shipping_np_warehouses_subject'),
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

vi.mock('@/lib/services/shop/shipping/nova-poshta-client', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/services/shop/shipping/nova-poshta-client')>(
      '@/lib/services/shop/shipping/nova-poshta-client'
    );
  return {
    ...actual,
    getWarehousesBySettlementRef: (...args: any[]) =>
      getWarehousesBySettlementRefMock(...args),
  };
});

vi.mock('@/lib/logging', () => ({
  logWarn: vi.fn(),
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

const { GET } = await import('@/app/api/shop/shipping/np/warehouses/route');

describe('shop shipping np warehouses route (phase 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('DATABASE_URL', 'https://example.com/db');
    vi.stubEnv('SHOP_SHIPPING_ENABLED', 'true');
    vi.stubEnv('SHOP_SHIPPING_NP_ENABLED', 'true');
    resetEnvCache();
    enforceRateLimitMock.mockResolvedValue({ ok: true, remaining: 99 });
    getWarehousesBySettlementRefMock.mockResolvedValue([]);
  });

  it('returns 200 + available=false when shipping is disabled', async () => {
    vi.stubEnv('SHOP_SHIPPING_ENABLED', 'false');
    vi.stubEnv('SHOP_SHIPPING_NP_ENABLED', 'false');

    const req = new NextRequest(
      'http://localhost/api/shop/shipping/np/warehouses?cityRef=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee&q=12'
    );
    const res = await GET(req);
    const json: any = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      available: false,
      reasonCode: 'SHOP_SHIPPING_DISABLED',
      items: [],
    });
    expect(getWarehousesBySettlementRefMock).not.toHaveBeenCalled();
  });

  it('local hit does not call NP', async () => {
    const cityRef = crypto.randomUUID();
    const warehouseRef = crypto.randomUUID();

    await db.insert(npCities).values({
      ref: cityRef,
      nameUa: 'Київ Локальний Тест',
      nameRu: null,
      area: 'Київська',
      region: 'Київ',
      settlementType: 'Місто',
      isActive: true,
    });

    await db.insert(npWarehouses).values({
      ref: warehouseRef,
      settlementRef: cityRef,
      cityRef: cityRef,
      number: '12',
      type: 'Warehouse',
      name: 'Відділення Локальний Тест',
      address: 'Київ, Тест 12',
      isPostMachine: false,
      isActive: true,
    });

    try {
      const req = new NextRequest(
        `http://localhost/api/shop/shipping/np/warehouses?cityRef=${cityRef}&q=локальний&locale=uk`
      );
      const res = await GET(req);
      const json: any = await res.json();

      expect(res.status).toBe(200);
      expect(json).toMatchObject({
        success: true,
        available: true,
        reasonCode: 'OK',
      });
      expect(Array.isArray(json.items)).toBe(true);
      expect(json.items.length).toBeGreaterThan(0);
      expect(json.items[0].ref).toBe(warehouseRef);
      expect(getWarehousesBySettlementRefMock).toHaveBeenCalledTimes(0);
    } finally {
      await db.delete(npWarehouses).where(eq(npWarehouses.ref, warehouseRef));
      await db.delete(npCities).where(eq(npCities.ref, cityRef));
    }
  });

  it('NP down returns 200 + available=false NP_UNAVAILABLE with empty items', async () => {
    const cityRef = crypto.randomUUID();
    getWarehousesBySettlementRefMock.mockRejectedValue(
      new NovaPoshtaApiError('NP_HTTP_ERROR', 'temporary', 503)
    );

    const req = new NextRequest(
      `http://localhost/api/shop/shipping/np/warehouses?cityRef=${cityRef}&q=nohit&locale=uk`
    );
    const res = await GET(req);
    const json: any = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(json).toEqual({
      success: true,
      available: false,
      reasonCode: 'NP_UNAVAILABLE',
      items: [],
    });
    expect(getWarehousesBySettlementRefMock).toHaveBeenCalledTimes(1);
  });
});
