import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * We intentionally mock:
 * - getCurrentUser() -> always admin
 * - parseAdminProductForm() -> returns controlled payload
 *
 * This isolates contract behavior of the API route:
 * returns stable code + details for SALE rule violations.
 */

const { getCurrentUserMock, parseAdminProductFormMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(async () => ({
    id: 'u_test_admin',
    email: 'admin@test.local',
    role: 'admin',
  })),
  parseAdminProductFormMock: vi.fn(),
}));

const { productsServiceMock } = vi.hoisted(() => ({
  productsServiceMock: {
    createProduct: vi.fn(),
    updateProduct: vi.fn(),
    deleteProduct: vi.fn(),
    getAdminProductByIdWithPrices: vi.fn(),
  },
}));

vi.mock('@/lib/services/products', () => productsServiceMock);

vi.mock('@/lib/auth', () => ({
  getCurrentUser: getCurrentUserMock,
}));

vi.mock('@/lib/admin/parseAdminProductForm', () => ({
  parseAdminProductForm: parseAdminProductFormMock,
}));

function makeFile(): File {
  return new File([new Uint8Array([1, 2, 3])], 'test.png', {
    type: 'image/png',
  });
}

function makeFormData(payload?: {
  badge?: string;
  prices?: unknown;
  pricesRaw?: string;
}): FormData {
  const fd = new FormData();
  fd.append('image', makeFile());

  if (payload?.badge) fd.append('badge', payload.badge);

  if (payload?.pricesRaw != null) fd.append('prices', payload.pricesRaw);
  else if (payload?.prices) fd.append('prices', JSON.stringify(payload.prices));

  return fd;
}

describe('P1-3 SALE rule end-to-end contract: admin products API returns stable code + details', () => {
  beforeEach(() => {
    parseAdminProductFormMock.mockReset();
    productsServiceMock.createProduct.mockReset();
    productsServiceMock.updateProduct.mockReset();
    productsServiceMock.deleteProduct.mockReset();
    productsServiceMock.getAdminProductByIdWithPrices.mockReset();
  });

  it('POST /api/shop/admin/products: SALE without originalPriceMinor -> 400 SALE_ORIGINAL_REQUIRED (required)', async () => {
    parseAdminProductFormMock.mockReturnValue({
      ok: true,
      data: {
        badge: 'SALE',
        prices: [
          { currency: 'USD', priceMinor: 5900, originalPriceMinor: null },
        ],
      },
    });

    const { POST } = await import('@/app/api/shop/admin/products/route');

    const req = new NextRequest(
      new Request('http://localhost/api/shop/admin/products', {
        method: 'POST',
        body: makeFormData({
          badge: 'SALE',
          prices: [
            { currency: 'USD', priceMinor: 5900, originalPriceMinor: null },
          ],
        }),
      })
    );

    const res = await POST(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(productsServiceMock.createProduct).not.toHaveBeenCalled();

    expect(json.code).toBe('SALE_ORIGINAL_REQUIRED');
    expect(json.field).toBe('prices');

    expect(json.details).toEqual({
      currency: 'USD',
      field: 'originalPriceMinor',
      rule: 'required',
    });
  });

  it('PATCH /api/shop/admin/products/:id: SALE originalPriceMinor <= priceMinor -> 400 SALE_ORIGINAL_REQUIRED (greater_than_price)', async () => {
    parseAdminProductFormMock.mockReturnValue({
      ok: true,
      data: {
        badge: 'SALE',
        prices: [
          { currency: 'UAH', priceMinor: 2000, originalPriceMinor: 2000 },
        ],
      },
    });

    const { PATCH } = await import('@/app/api/shop/admin/products/[id]/route');

    const req = new NextRequest(
      new Request(
        'http://localhost/api/shop/admin/products/11111111-1111-4111-8111-111111111111',
        {
          method: 'PATCH',
          body: makeFormData({
            badge: 'SALE',
            prices: [
              { currency: 'UAH', priceMinor: 2000, originalPriceMinor: 2000 },
            ],
          }),
        }
      )
    );

    const res = await PATCH(req, {
      params: Promise.resolve({
        id: '11111111-1111-4111-8111-111111111111',
      }),
    });

    expect(res.status).toBe(400);

    const json = await res.json();
    expect(productsServiceMock.updateProduct).not.toHaveBeenCalled();

    expect(json.code).toBe('SALE_ORIGINAL_REQUIRED');
    expect(json.field).toBe('prices');

    expect(json.details).toEqual({
      currency: 'UAH',
      field: 'originalPriceMinor',
      rule: 'greater_than_price',
    });
  });
  it('POST /api/shop/admin/products: invalid prices JSON -> 400 INVALID_PRICES_JSON', async () => {
    parseAdminProductFormMock.mockImplementation(() => {
      throw new Error('parseAdminProductForm must not be called');
    });

    const { POST } = await import('@/app/api/shop/admin/products/route');

    const req = new NextRequest(
      new Request('http://localhost/api/shop/admin/products', {
        method: 'POST',
        body: makeFormData({ badge: 'SALE', pricesRaw: '{' }),
      })
    );

    const res = await POST(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.code).toBe('INVALID_PRICES_JSON');
    expect(json.field).toBe('prices');

    expect(productsServiceMock.createProduct).not.toHaveBeenCalled();
    expect(parseAdminProductFormMock).not.toHaveBeenCalled();
  });

  it('PATCH /api/shop/admin/products/:id: invalid prices JSON -> 400 INVALID_PRICES_JSON', async () => {
    parseAdminProductFormMock.mockImplementation(() => {
      throw new Error('parseAdminProductForm must not be called');
    });

    const { PATCH } = await import('@/app/api/shop/admin/products/[id]/route');

    const req = new NextRequest(
      new Request(
        'http://localhost/api/shop/admin/products/11111111-1111-4111-8111-111111111111',
        {
          method: 'PATCH',
          body: makeFormData({ badge: 'SALE', pricesRaw: '{' }),
        }
      )
    );

    const res = await PATCH(req, {
      params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }),
    });

    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.code).toBe('INVALID_PRICES_JSON');
    expect(json.field).toBe('prices');

    expect(productsServiceMock.updateProduct).not.toHaveBeenCalled();
    expect(parseAdminProductFormMock).not.toHaveBeenCalled();
  });
});
