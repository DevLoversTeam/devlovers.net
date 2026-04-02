import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(async () => ({
    id: 'admin-user-1',
    role: 'admin',
    email: 'admin@example.com',
  })),
  requireAdminCsrf: vi.fn(() => null),
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
    code = 'ADMIN_UNAUTHORIZED' as const;
  }
  class AdminForbiddenError extends Error {
    code = 'ADMIN_FORBIDDEN' as const;
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

vi.mock('@/lib/services/shop/events/write-admin-audit', () => ({
  writeAdminAudit: mocks.writeAdminAudit,
}));

import { PATCH } from '@/app/api/shop/admin/products/[id]/status/route';
import { db } from '@/db';
import { getPublicProductBySlug } from '@/db/queries/shop/products';
import { productPrices, products } from '@/db/schema';
import { updateProduct } from '@/lib/services/products';
import { toDbMoney } from '@/lib/shop/money';

type SeededProduct = {
  productId: string;
  slug: string;
  initialTitle: string;
  initialStock: number;
};

async function cleanupProduct(productId: string | null) {
  if (!productId) return;
  await db.delete(productPrices).where(eq(productPrices.productId, productId));
  await db.delete(products).where(eq(products.id, productId));
}

async function seedInactiveProduct(args?: {
  badge?: 'NONE' | 'SALE';
  imageUrl?: string;
  prices?: Array<{
    currency: 'USD' | 'UAH';
    priceMinor: number;
    originalPriceMinor: number | null;
  }>;
}): Promise<SeededProduct> {
  const productId = randomUUID();
  const slug = `activation-${randomUUID()}`;
  const initialTitle = `Activation ${slug.slice(0, 8)}`;
  const initialStock = 5;
  const badge = args?.badge ?? 'NONE';
  const imageUrl = args?.imageUrl ?? 'https://example.com/activation.png';
  const prices = args?.prices ?? [
    { currency: 'USD', priceMinor: 1600, originalPriceMinor: null },
    { currency: 'UAH', priceMinor: 6400, originalPriceMinor: null },
  ];

  const usdMirror =
    prices.find(row => row.currency === 'USD') ??
    prices.find(row => row.currency === 'UAH')!;

  await db.insert(products).values({
    id: productId,
    slug,
    title: initialTitle,
    description: null,
    imageUrl,
    imagePublicId: null,
    price: toDbMoney(usdMirror.priceMinor),
    originalPrice:
      usdMirror.originalPriceMinor == null
        ? null
        : toDbMoney(usdMirror.originalPriceMinor),
    currency: 'USD',
    category: null,
    type: null,
    colors: [],
    sizes: [],
    badge,
    isActive: false,
    isFeatured: false,
    stock: initialStock,
    sku: null,
  } as any);

  await db.insert(productPrices).values(
    prices.map(row => ({
      productId,
      currency: row.currency,
      priceMinor: row.priceMinor,
      originalPriceMinor: row.originalPriceMinor,
      price: toDbMoney(row.priceMinor),
      originalPrice:
        row.originalPriceMinor == null
          ? null
          : toDbMoney(row.originalPriceMinor),
    }))
  );

  return {
    productId,
    slug,
    initialTitle,
    initialStock,
  };
}

function makeStatusRequest(productId: string): NextRequest {
  return new NextRequest(
    new Request(
      `http://localhost/api/shop/admin/products/${productId}/status`,
      {
        method: 'PATCH',
        headers: { origin: 'http://localhost:3000' },
      }
    )
  );
}

describe.sequential('admin product activation validation', () => {
  let seededProductId: string | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await cleanupProduct(seededProductId);
    seededProductId = null;
  });

  it('activates a valid complete inactive product without mutating unrelated fields', async () => {
    const seeded = await seedInactiveProduct();
    seededProductId = seeded.productId;

    expect(await getPublicProductBySlug(seeded.slug, 'USD')).toBeNull();

    const res = await PATCH(makeStatusRequest(seeded.productId), {
      params: Promise.resolve({ id: seeded.productId }),
    } as any);

    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.product.isActive).toBe(true);

    const [productRow] = await db
      .select({
        isActive: products.isActive,
        title: products.title,
        stock: products.stock,
      })
      .from(products)
      .where(eq(products.id, seeded.productId))
      .limit(1);

    expect(productRow?.isActive).toBe(true);
    expect(productRow?.title).toBe(seeded.initialTitle);
    expect(productRow?.stock).toBe(seeded.initialStock);
    expect(await getPublicProductBySlug(seeded.slug, 'USD')).not.toBeNull();
    expect(mocks.writeAdminAudit).toHaveBeenCalledTimes(1);
  });

  it('rejects activation when the resulting product state is missing the required UAH storefront row', async () => {
    const seeded = await seedInactiveProduct({
      prices: [{ currency: 'USD', priceMinor: 1600, originalPriceMinor: null }],
    });
    seededProductId = seeded.productId;

    expect(await getPublicProductBySlug(seeded.slug, 'USD')).toBeNull();

    const res = await PATCH(makeStatusRequest(seeded.productId), {
      params: Promise.resolve({ id: seeded.productId }),
    } as any);

    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.code).toBe('PRICE_CONFIG_ERROR');
    expect(json.currency).toBe('UAH');

    const [productRow] = await db
      .select({ isActive: products.isActive })
      .from(products)
      .where(eq(products.id, seeded.productId))
      .limit(1);

    expect(productRow?.isActive).toBe(false);
    expect(await getPublicProductBySlug(seeded.slug, 'USD')).toBeNull();
    expect(mocks.writeAdminAudit).not.toHaveBeenCalled();
  });

  it('rejects activation when a SALE product is missing required original prices', async () => {
    const seeded = await seedInactiveProduct({
      badge: 'SALE',
      prices: [{ currency: 'UAH', priceMinor: 6400, originalPriceMinor: null }],
    });
    seededProductId = seeded.productId;

    const res = await PATCH(makeStatusRequest(seeded.productId), {
      params: Promise.resolve({ id: seeded.productId }),
    } as any);

    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.code).toBe('SALE_ORIGINAL_REQUIRED');
    expect(json.field).toBe('prices');
    expect(json.details?.currency).toBe('UAH');

    const [productRow] = await db
      .select({ isActive: products.isActive })
      .from(products)
      .where(eq(products.id, seeded.productId))
      .limit(1);

    expect(productRow?.isActive).toBe(false);
    expect(mocks.writeAdminAudit).not.toHaveBeenCalled();
  });

  it('rejects activation when the product has no usable photo state', async () => {
    const seeded = await seedInactiveProduct({
      imageUrl: '   ',
    });
    seededProductId = seeded.productId;

    const res = await PATCH(makeStatusRequest(seeded.productId), {
      params: Promise.resolve({ id: seeded.productId }),
    } as any);

    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.code).toBe('IMAGE_REQUIRED');
    expect(json.field).toBe('photos');

    const [productRow] = await db
      .select({ isActive: products.isActive })
      .from(products)
      .where(eq(products.id, seeded.productId))
      .limit(1);

    expect(productRow?.isActive).toBe(false);
    expect(mocks.writeAdminAudit).not.toHaveBeenCalled();
  });

  it('does not block non-activation updates on the same valid inactive product state', async () => {
    const seeded = await seedInactiveProduct();
    seededProductId = seeded.productId;

    const updated = await updateProduct(seeded.productId, {
      title: 'Retitled while staying inactive',
    });

    expect(updated.title).toBe('Retitled while staying inactive');
    expect(updated.isActive).toBe(false);

    const [productRow] = await db
      .select({
        title: products.title,
        isActive: products.isActive,
      })
      .from(products)
      .where(eq(products.id, seeded.productId))
      .limit(1);

    expect(productRow?.title).toBe('Retitled while staying inactive');
    expect(productRow?.isActive).toBe(false);
  });
});
