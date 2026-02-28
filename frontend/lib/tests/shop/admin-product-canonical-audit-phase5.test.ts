import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const adminUser = {
  id: 'admin_user_1',
  role: 'admin',
  email: 'admin@example.com',
};

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(async () => adminUser),
  requireAdminCsrf: vi.fn(() => null),
  parseAdminProductForm: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
  toggleProductStatus: vi.fn(),
  getAdminProductByIdWithPrices: vi.fn(),
  writeAdminAudit: vi.fn(async () => ({
    inserted: true,
    dedupeKey: 'admin_audit:v1:test',
    id: 'audit_row_1',
  })),
}));

vi.mock('@/lib/auth/admin', () => {
  class AdminApiDisabledError extends Error {
    code = 'ADMIN_API_DISABLED' as const;
  }
  class AdminUnauthorizedError extends Error {
    code = 'UNAUTHORIZED' as const;
  }
  class AdminForbiddenError extends Error {
    code = 'FORBIDDEN' as const;
  }
  return {
    AdminApiDisabledError,
    AdminUnauthorizedError,
    AdminForbiddenError,
    requireAdminApi: mocks.requireAdminApi,
  };
});

vi.mock('@/lib/security/admin-csrf', () => ({
  requireAdminCsrf: mocks.requireAdminCsrf,
}));

vi.mock('@/lib/admin/parseAdminProductForm', () => ({
  parseAdminProductForm: mocks.parseAdminProductForm,
}));

vi.mock('@/lib/services/products', () => ({
  createProduct: mocks.createProduct,
  updateProduct: mocks.updateProduct,
  deleteProduct: mocks.deleteProduct,
  toggleProductStatus: mocks.toggleProductStatus,
  getAdminProductByIdWithPrices: mocks.getAdminProductByIdWithPrices,
}));

vi.mock('@/lib/services/shop/events/write-admin-audit', () => ({
  writeAdminAudit: mocks.writeAdminAudit,
}));

function makeProduct(id: string, isActive = true) {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id,
    slug: `slug-${id.slice(0, 8)}`,
    title: `Title ${id.slice(0, 8)}`,
    description: 'desc',
    imageUrl: 'https://example.com/product.png',
    imagePublicId: 'products/p1',
    price: 10,
    originalPrice: undefined,
    currency: 'USD',
    category: undefined,
    type: undefined,
    colors: [],
    sizes: [],
    badge: 'NONE',
    isActive,
    isFeatured: false,
    stock: 3,
    sku: undefined,
    createdAt: now,
    updatedAt: now,
  };
}

function makeFormDataWithImage(): FormData {
  const fd = new FormData();
  fd.append(
    'image',
    new File([new Uint8Array([1, 2, 3])], 'test.png', { type: 'image/png' })
  );
  return fd;
}

describe('admin product canonical audit phase 5', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ENABLE_ADMIN_API', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('POST create writes canonical admin_audit entry with dedupe seed', async () => {
    const requestId = 'req_product_create_1';
    mocks.parseAdminProductForm.mockReturnValue({
      ok: true,
      data: {
        title: 'New product',
        badge: 'NONE',
        prices: [{ currency: 'USD', priceMinor: 1000, originalPriceMinor: null }],
      },
    });

    const createdId = '11111111-1111-4111-8111-111111111111';
    mocks.createProduct.mockResolvedValue(makeProduct(createdId, true));

    const { POST } = await import('@/app/api/shop/admin/products/route');
    const req = new NextRequest(
      new Request('http://localhost/api/shop/admin/products', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          'x-request-id': requestId,
        },
        body: makeFormDataWithImage(),
      })
    );

    const res = await POST(req);
    expect(res.status).toBe(201);

    expect(mocks.writeAdminAudit).toHaveBeenCalledTimes(1);
    const call = mocks.writeAdminAudit.mock.calls[0]?.[0];
    expect(call).toMatchObject({
      actorUserId: adminUser.id,
      action: 'product_admin_action.create',
      targetType: 'product',
      targetId: createdId,
      requestId,
      dedupeSeed: {
        domain: 'product_admin_action',
        action: 'create',
        requestId,
        productId: createdId,
      },
    });
  });

  it('PATCH update writes canonical admin_audit entry with dedupe seed', async () => {
    const requestId = 'req_product_update_1';
    const productId = '22222222-2222-4222-8222-222222222222';

    mocks.parseAdminProductForm.mockReturnValue({
      ok: true,
      data: {
        title: 'Updated title',
        badge: 'NONE',
        prices: [{ currency: 'USD', priceMinor: 2000, originalPriceMinor: null }],
      },
    });
    mocks.updateProduct.mockResolvedValue(makeProduct(productId, true));

    const { PATCH } = await import('@/app/api/shop/admin/products/[id]/route');
    const req = new NextRequest(
      new Request(`http://localhost/api/shop/admin/products/${productId}`, {
        method: 'PATCH',
        headers: {
          origin: 'http://localhost:3000',
          'x-request-id': requestId,
        },
        body: makeFormDataWithImage(),
      })
    );

    const res = await PATCH(req, {
      params: Promise.resolve({ id: productId }),
    });
    expect(res.status).toBe(200);

    expect(mocks.writeAdminAudit).toHaveBeenCalledTimes(1);
    const call = mocks.writeAdminAudit.mock.calls[0]?.[0];
    expect(call).toMatchObject({
      actorUserId: adminUser.id,
      action: 'product_admin_action.update',
      targetType: 'product',
      targetId: productId,
      requestId,
      dedupeSeed: {
        domain: 'product_admin_action',
        action: 'update',
        requestId,
        productId,
      },
    });
  });

  it('DELETE writes canonical admin_audit entry with dedupe seed', async () => {
    const requestId = 'req_product_delete_1';
    const productId = '33333333-3333-4333-8333-333333333333';

    mocks.deleteProduct.mockResolvedValue(undefined);

    const { DELETE } = await import('@/app/api/shop/admin/products/[id]/route');
    const req = new NextRequest(
      new Request(`http://localhost/api/shop/admin/products/${productId}`, {
        method: 'DELETE',
        headers: {
          origin: 'http://localhost:3000',
          'x-request-id': requestId,
        },
      })
    );

    const res = await DELETE(req, {
      params: Promise.resolve({ id: productId }),
    });
    expect(res.status).toBe(200);

    expect(mocks.writeAdminAudit).toHaveBeenCalledTimes(1);
    const call = mocks.writeAdminAudit.mock.calls[0]?.[0];
    expect(call).toMatchObject({
      actorUserId: adminUser.id,
      action: 'product_admin_action.delete',
      targetType: 'product',
      targetId: productId,
      requestId,
      dedupeSeed: {
        domain: 'product_admin_action',
        action: 'delete',
        requestId,
        productId,
      },
    });
  });

  it('status toggle writes canonical admin_audit entry with dedupe seed', async () => {
    const requestId = 'req_product_toggle_1';
    const productId = '44444444-4444-4444-8444-444444444444';

    mocks.toggleProductStatus.mockResolvedValue(makeProduct(productId, false));

    const { PATCH } = await import(
      '@/app/api/shop/admin/products/[id]/status/route'
    );
    const req = new NextRequest(
      new Request(`http://localhost/api/shop/admin/products/${productId}/status`, {
        method: 'PATCH',
        headers: {
          origin: 'http://localhost:3000',
          'x-request-id': requestId,
        },
      })
    );

    const res = await PATCH(req, {
      params: Promise.resolve({ id: productId }),
    });
    expect(res.status).toBe(200);

    expect(mocks.writeAdminAudit).toHaveBeenCalledTimes(1);
    const call = mocks.writeAdminAudit.mock.calls[0]?.[0];
    expect(call).toMatchObject({
      actorUserId: adminUser.id,
      action: 'product_admin_action.toggle_status',
      targetType: 'product',
      targetId: productId,
      requestId,
      dedupeSeed: {
        domain: 'product_admin_action',
        action: 'toggle_status',
        requestId,
        productId,
        toIsActive: false,
      },
    });
  });
});
