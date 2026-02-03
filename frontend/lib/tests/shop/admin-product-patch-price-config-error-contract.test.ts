import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PriceConfigError } from '@/lib/services/errors';

vi.mock('@/lib/auth/admin', () => ({
  requireAdminApi: vi.fn(async () => {}),
  AdminApiDisabledError: class AdminApiDisabledError extends Error {
    code = 'ADMIN_API_DISABLED' as const;
  },
  AdminUnauthorizedError: class AdminUnauthorizedError extends Error {
    code = 'ADMIN_UNAUTHORIZED' as const;
  },
  AdminForbiddenError: class AdminForbiddenError extends Error {
    code = 'ADMIN_FORBIDDEN' as const;
  },
}));

vi.mock('@/lib/admin/parseAdminProductForm', () => ({
  parseAdminProductForm: vi.fn(() => ({
    ok: true,
    data: { badge: 'NONE', prices: [{ currency: 'UAH', priceMinor: 1000 }] },
  })),
}));

vi.mock('@/lib/services/products', () => ({
  updateProduct: vi.fn(async () => {
    throw new PriceConfigError('USD price is required.', {
      productId: 'p1',
      currency: 'USD',
    });
  }),
  getAdminProductByIdWithPrices: vi.fn(),
  deleteProduct: vi.fn(),
}));
vi.mock('@/lib/security/admin-csrf', () => ({
  requireAdminCsrf: vi.fn(() => null),
}));

import { PATCH } from '@/app/api/shop/admin/products/[id]/route';

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(): NextRequest {
  const fd = new FormData();

  fd.set('title', 'Test product');
  fd.set('badge', 'NONE');
  fd.set('isActive', 'true');
  fd.set('isFeatured', 'false');
  fd.set('stock', '0');

  fd.set(
    'prices',
    JSON.stringify([
      { currency: 'USD', priceMinor: 999, originalPriceMinor: null },
      { currency: 'UAH', priceMinor: 1000, originalPriceMinor: null },
    ])
  );

  return new NextRequest(
    new Request(
      'http://localhost/api/shop/admin/products/00000000-0000-4000-8000-000000000001',
      {
        method: 'PATCH',
        headers: { origin: 'http://localhost:3000' },
        body: fd,
      }
    )
  );
}

describe('admin PATCH /shop/admin/products/:id (PRICE_CONFIG_ERROR contract)', () => {
  it('returns 400 PRICE_CONFIG_ERROR when merged policy is violated', async () => {
    const res = await PATCH(makeReq(), {
      params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000001' }),
    } as any);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('PRICE_CONFIG_ERROR');
  });
});
