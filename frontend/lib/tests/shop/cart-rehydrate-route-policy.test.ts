import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rehydrateCartItemsMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/services/products', () => ({
  rehydrateCartItems: (...args: unknown[]) => rehydrateCartItemsMock(...args),
}));

vi.mock('@/lib/logging', () => ({
  logWarn: vi.fn(),
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

const { POST } = await import('@/app/api/shop/cart/rehydrate/route');

describe('cart rehydrate route public policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rehydrateCartItemsMock.mockResolvedValue({
      items: [],
      summary: {
        quantity: 0,
        totalAmountMinor: 0,
        currency: 'UAH',
        pricingFingerprint: 'f'.repeat(64),
      },
    });
  });

  it('rehydrates carts in the standard storefront UAH currency even on en locale requests', async () => {
    const request = new NextRequest(
      'http://localhost/api/shop/cart/rehydrate',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        body: JSON.stringify({
          items: [],
        }),
      }
    );

    const response = await POST(request);
    const json: any = await response.json();

    expect(response.status).toBe(200);
    expect(rehydrateCartItemsMock).toHaveBeenCalledWith([], 'UAH');
    expect(json.summary.currency).toBe('UAH');
  });
});
