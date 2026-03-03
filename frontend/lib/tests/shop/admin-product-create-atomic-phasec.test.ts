import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import { productPrices, products } from '@/db/schema';

const adminUser = {
  id: 'admin_user_atomic_1',
  role: 'admin',
  email: 'admin.atomic@example.com',
};

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(async () => adminUser),
  requireAdminCsrf: vi.fn(() => null),
  parseAdminProductForm: vi.fn(),
  writeAdminAudit: vi.fn(async () => {
    throw new Error('audit-fail');
  }),
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

vi.mock('@/lib/services/shop/events/write-admin-audit', () => ({
  writeAdminAudit: mocks.writeAdminAudit,
}));

vi.mock('@/lib/cloudinary', () => ({
  uploadProductImageFromFile: vi.fn(async () => ({
    secureUrl: 'https://example.com/atomic-create-test.png',
    publicId: 'products/atomic-create-test',
  })),
  destroyProductImage: vi.fn(async () => {}),
}));

async function cleanupBySlug(slug: string) {
  const existing = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.slug, slug))
    .limit(1);

  const productId = existing[0]?.id;
  if (!productId) return;

  await db.delete(productPrices).where(eq(productPrices.productId, productId));
  await db.delete(products).where(eq(products.id, productId));
}

function makeFormData(): FormData {
  const fd = new FormData();
  fd.append(
    'image',
    new File([new Uint8Array([1, 2, 3, 4])], 'atomic.png', {
      type: 'image/png',
    })
  );
  return fd;
}

describe.sequential('admin products create atomicity (phase C)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ENABLE_ADMIN_API', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not persist product when admin audit write fails', async () => {
    const slug = `atomic-create-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    mocks.parseAdminProductForm.mockReturnValue({
      ok: true,
      data: {
        slug,
        title: 'Atomic create product',
        badge: 'NONE',
        prices: [
          { currency: 'USD', priceMinor: 1999, originalPriceMinor: null },
        ],
        stock: 2,
        isActive: true,
        isFeatured: false,
      },
    });

    await cleanupBySlug(slug);

    try {
      const { POST } = await import('@/app/api/shop/admin/products/route');

      const req = new NextRequest(
        new Request('http://localhost/api/shop/admin/products', {
          method: 'POST',
          headers: {
            origin: 'http://localhost:3000',
            'x-request-id': `req_${crypto.randomUUID()}`,
          },
          body: makeFormData(),
        })
      );

      const res = await POST(req);
      expect(res.status).toBe(500);

      const json = await res.json();
      expect(json.code).toBe('INTERNAL_ERROR');
      expect(mocks.writeAdminAudit).toHaveBeenCalled();
      expect(mocks.writeAdminAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'product_admin_action.create',
          targetType: 'product',
        })
      );

      const existing = await db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.slug, slug))
        .limit(1);

      expect(existing).toHaveLength(0);
    } finally {
      await cleanupBySlug(slug);
    }
  });

  it('does not destroy Cloudinary image when rollback product delete fails', async () => {
    const slug = `atomic-create-rollback-${Date.now()}-${crypto
      .randomUUID()
      .slice(0, 8)}`;

    mocks.parseAdminProductForm.mockReturnValue({
      ok: true,
      data: {
        slug,
        title: 'Atomic create rollback guard',
        badge: 'NONE',
        prices: [
          { currency: 'USD', priceMinor: 2099, originalPriceMinor: null },
        ],
        stock: 2,
        isActive: true,
        isFeatured: false,
      },
    });

    await cleanupBySlug(slug);

    const productServices = await import('@/lib/services/products');
    const deleteSpy = vi
      .spyOn(productServices, 'deleteProduct')
      .mockRejectedValueOnce(new Error('rollback-delete-fail'));

    const cloudinary = await import('@/lib/cloudinary');
    const destroyProductImageMock = vi.mocked(cloudinary.destroyProductImage);
    const uploadProductImageFromFileMock = vi.mocked(
      cloudinary.uploadProductImageFromFile
    );

    try {
      const { POST } = await import('@/app/api/shop/admin/products/route');

      const req = new NextRequest(
        new Request('http://localhost/api/shop/admin/products', {
          method: 'POST',
          headers: {
            origin: 'http://localhost:3000',
            'x-request-id': `req_${crypto.randomUUID()}`,
          },
          body: makeFormData(),
        })
      );

      const res = await POST(req);
      expect(res.status).toBe(500);
      expect(mocks.writeAdminAudit).toHaveBeenCalled();
      expect(mocks.writeAdminAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'product_admin_action.create',
          targetType: 'product',
        })
      );
      expect(deleteSpy).toHaveBeenCalled();
      expect(uploadProductImageFromFileMock).toHaveBeenCalledTimes(1);
      expect(destroyProductImageMock).not.toHaveBeenCalled();

      const existing = await db
        .select({ id: products.id, imagePublicId: products.imagePublicId })
        .from(products)
        .where(eq(products.slug, slug))
        .limit(1);

      expect(existing).toHaveLength(1);
      expect(existing[0]?.imagePublicId).toBeTruthy();
    } finally {
      deleteSpy.mockRestore();
      await cleanupBySlug(slug);
    }
  });
});
