import { randomUUID } from 'node:crypto';

import { asc, eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';

const cloudinaryMocks = vi.hoisted(() => ({
  uploadProductImageFromFile: vi.fn(),
  destroyProductImage: vi.fn(),
}));

vi.mock('@/lib/cloudinary', () => cloudinaryMocks);

import { db } from '@/db';
import { getPublicProductBySlug } from '@/db/queries/shop/products';
import { productImages, productPrices, products } from '@/db/schema';
import { createProduct, updateProduct } from '@/lib/services/products';
import { toDbMoney } from '@/lib/shop/money';

async function cleanupProduct(productId: string) {
  await db.delete(products).where(eq(products.id, productId));
}

describe.sequential('product images contract', () => {
  const createdProductIds: string[] = [];

  afterEach(async () => {
    vi.clearAllMocks();

    for (const productId of createdProductIds.splice(0)) {
      await cleanupProduct(productId);
    }
  });

  it('preserves legacy single-image products by synthesizing a primary image contract', async () => {
    const productId = randomUUID();
    const slug = `legacy-product-${randomUUID()}`;
    createdProductIds.push(productId);

    await db.insert(products).values({
      id: productId,
      slug,
      title: 'Legacy product',
      description: null,
      imageUrl: 'https://example.com/legacy-primary.png',
      imagePublicId: 'products/legacy-primary',
      price: toDbMoney(2500),
      originalPrice: null,
      currency: 'USD',
      category: null,
      type: null,
      colors: [],
      sizes: [],
      badge: 'NONE',
      isActive: true,
      isFeatured: false,
      stock: 3,
      sku: null,
    });

    await db.insert(productPrices).values({
      productId,
      currency: 'USD',
      priceMinor: 2500,
      originalPriceMinor: null,
      price: toDbMoney(2500),
      originalPrice: null,
    });

    const product = await getPublicProductBySlug(slug, 'USD');

    expect(product).not.toBeNull();
    expect(product?.imageUrl).toBe('https://example.com/legacy-primary.png');
    expect(product?.primaryImage?.imageUrl).toBe(
      'https://example.com/legacy-primary.png'
    );
    expect(product?.primaryImage?.isPrimary).toBe(true);
    expect(product?.images).toHaveLength(1);
    expect(product?.images[0]?.id).toBe(`legacy:${productId}`);
  });

  it('hydrates ordered image collections and explicit primary image from product_images', async () => {
    const productId = randomUUID();
    const slug = `gallery-product-${randomUUID()}`;
    createdProductIds.push(productId);

    await db.insert(products).values({
      id: productId,
      slug,
      title: 'Gallery product',
      description: null,
      imageUrl: 'https://example.com/stale-legacy.png',
      imagePublicId: 'products/stale-legacy',
      price: toDbMoney(3400),
      originalPrice: null,
      currency: 'USD',
      category: null,
      type: null,
      colors: [],
      sizes: [],
      badge: 'NONE',
      isActive: true,
      isFeatured: false,
      stock: 8,
      sku: null,
    });

    await db.insert(productPrices).values({
      productId,
      currency: 'USD',
      priceMinor: 3400,
      originalPriceMinor: null,
      price: toDbMoney(3400),
      originalPrice: null,
    });

    await db.insert(productImages).values([
      {
        productId,
        imageUrl: 'https://example.com/gallery-secondary.png',
        imagePublicId: 'products/gallery-secondary',
        sortOrder: 20,
        isPrimary: false,
      },
      {
        productId,
        imageUrl: 'https://example.com/gallery-primary.png',
        imagePublicId: 'products/gallery-primary',
        sortOrder: 10,
        isPrimary: true,
      },
      {
        productId,
        imageUrl: 'https://example.com/gallery-third.png',
        imagePublicId: 'products/gallery-third',
        sortOrder: 30,
        isPrimary: false,
      },
    ]);

    const product = await getPublicProductBySlug(slug, 'USD');

    expect(product).not.toBeNull();
    expect(product?.imageUrl).toBe('https://example.com/gallery-primary.png');
    expect(product?.imagePublicId).toBe('products/gallery-primary');
    expect(product?.primaryImage?.imageUrl).toBe(
      'https://example.com/gallery-primary.png'
    );
    expect(product?.images.map(image => image.imageUrl)).toEqual([
      'https://example.com/gallery-primary.png',
      'https://example.com/gallery-secondary.png',
      'https://example.com/gallery-third.png',
    ]);
  });

  it('createProduct writes a primary product_images row and returns the expanded image contract', async () => {
    cloudinaryMocks.uploadProductImageFromFile.mockResolvedValueOnce({
      secureUrl: 'https://example.com/create-primary.png',
      publicId: 'products/create-primary',
    });

    const created = await createProduct({
      title: `Created product ${randomUUID()}`,
      image: new File([new Uint8Array([1, 2, 3])], 'create.png', {
        type: 'image/png',
      }),
      prices: [{ currency: 'USD', priceMinor: 4100, originalPriceMinor: null }],
      badge: 'NONE',
      stock: 4,
      isActive: true,
      isFeatured: false,
    } as any);

    createdProductIds.push(created.id);

    const imageRows = await db
      .select({
        imageUrl: productImages.imageUrl,
        imagePublicId: productImages.imagePublicId,
        sortOrder: productImages.sortOrder,
        isPrimary: productImages.isPrimary,
      })
      .from(productImages)
      .where(eq(productImages.productId, created.id))
      .orderBy(asc(productImages.sortOrder));

    expect(created.imageUrl).toBe('https://example.com/create-primary.png');
    expect(created.primaryImage?.imageUrl).toBe(
      'https://example.com/create-primary.png'
    );
    expect(created.images).toHaveLength(1);
    expect(imageRows).toEqual([
      {
        imageUrl: 'https://example.com/create-primary.png',
        imagePublicId: 'products/create-primary',
        sortOrder: 0,
        isPrimary: true,
      },
    ]);
  });

  it('updateProduct replaces only the explicit primary image and preserves the rest of the gallery', async () => {
    const productId = randomUUID();
    const slug = `update-gallery-${randomUUID()}`;
    createdProductIds.push(productId);

    await db.insert(products).values({
      id: productId,
      slug,
      title: 'Update gallery product',
      description: null,
      imageUrl: 'https://example.com/old-primary.png',
      imagePublicId: 'products/old-primary',
      price: toDbMoney(5400),
      originalPrice: null,
      currency: 'USD',
      category: null,
      type: null,
      colors: [],
      sizes: [],
      badge: 'NONE',
      isActive: true,
      isFeatured: false,
      stock: 9,
      sku: null,
    });

    await db.insert(productPrices).values({
      productId,
      currency: 'USD',
      priceMinor: 5400,
      originalPriceMinor: null,
      price: toDbMoney(5400),
      originalPrice: null,
    });

    await db.insert(productImages).values([
      {
        productId,
        imageUrl: 'https://example.com/old-primary.png',
        imagePublicId: 'products/old-primary',
        sortOrder: 1,
        isPrimary: true,
      },
      {
        productId,
        imageUrl: 'https://example.com/secondary.png',
        imagePublicId: 'products/secondary',
        sortOrder: 2,
        isPrimary: false,
      },
    ]);

    cloudinaryMocks.uploadProductImageFromFile.mockResolvedValueOnce({
      secureUrl: 'https://example.com/new-primary.png',
      publicId: 'products/new-primary',
    });

    const updated = await updateProduct(productId, {
      title: 'Updated gallery product',
      image: new File([new Uint8Array([5, 6, 7])], 'updated.png', {
        type: 'image/png',
      }),
    });

    const imageRows = await db
      .select({
        imageUrl: productImages.imageUrl,
        imagePublicId: productImages.imagePublicId,
        sortOrder: productImages.sortOrder,
        isPrimary: productImages.isPrimary,
      })
      .from(productImages)
      .where(eq(productImages.productId, productId))
      .orderBy(asc(productImages.sortOrder));

    const [productRow] = await db
      .select({
        imageUrl: products.imageUrl,
        imagePublicId: products.imagePublicId,
      })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    expect(updated.primaryImage?.imageUrl).toBe(
      'https://example.com/new-primary.png'
    );
    expect(updated.images.map(image => image.imageUrl)).toEqual([
      'https://example.com/new-primary.png',
      'https://example.com/secondary.png',
    ]);
    expect(imageRows).toEqual([
      {
        imageUrl: 'https://example.com/new-primary.png',
        imagePublicId: 'products/new-primary',
        sortOrder: 1,
        isPrimary: true,
      },
      {
        imageUrl: 'https://example.com/secondary.png',
        imagePublicId: 'products/secondary',
        sortOrder: 2,
        isPrimary: false,
      },
    ]);
    expect(productRow).toEqual({
      imageUrl: 'https://example.com/new-primary.png',
      imagePublicId: 'products/new-primary',
    });
    expect(cloudinaryMocks.destroyProductImage).toHaveBeenCalledWith(
      'products/old-primary'
    );
  });
});
