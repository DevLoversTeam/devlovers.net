import { randomUUID } from 'node:crypto';

import { asc, eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';

const cloudinaryMocks = vi.hoisted(() => ({
  uploadProductImageFromFile: vi.fn(),
  destroyProductImage: vi.fn(),
}));

vi.mock('@/lib/cloudinary', () => cloudinaryMocks);

import { db } from '@/db';
import { productImages, productPrices, products } from '@/db/schema';
import { InvalidPayloadError } from '@/lib/services/errors';
import { createProduct, updateProduct } from '@/lib/services/products';
import { toDbMoney } from '@/lib/shop/money';

async function cleanupProduct(productId: string) {
  await db.delete(products).where(eq(products.id, productId));
}

function dualCurrencyPrices(
  priceMinor: number,
  originalPriceMinor: number | null = null
) {
  return [
    { currency: 'UAH' as const, priceMinor, originalPriceMinor },
    { currency: 'USD' as const, priceMinor, originalPriceMinor },
  ];
}

function dualCurrencyPriceRows(
  productId: string,
  priceMinor: number,
  originalPriceMinor: number | null = null
) {
  return dualCurrencyPrices(priceMinor, originalPriceMinor).map(price => ({
    productId,
    currency: price.currency,
    priceMinor: price.priceMinor,
    originalPriceMinor: price.originalPriceMinor,
    price: toDbMoney(price.priceMinor),
    originalPrice:
      price.originalPriceMinor == null
        ? null
        : toDbMoney(price.originalPriceMinor),
  }));
}

describe.sequential('admin product photo management', () => {
  const createdProductIds: string[] = [];

  afterEach(async () => {
    vi.clearAllMocks();

    for (const productId of createdProductIds.splice(0)) {
      await cleanupProduct(productId);
    }
  });

  it('createProduct supports multiple uploaded photos with explicit primary and stable ordering', async () => {
    cloudinaryMocks.uploadProductImageFromFile
      .mockResolvedValueOnce({
        secureUrl: 'https://example.com/u1.png',
        publicId: 'products/u1',
      })
      .mockResolvedValueOnce({
        secureUrl: 'https://example.com/u2.png',
        publicId: 'products/u2',
      })
      .mockResolvedValueOnce({
        secureUrl: 'https://example.com/u3.png',
        publicId: 'products/u3',
      });

    const created = await createProduct({
      title: `Photo create ${randomUUID()}`,
      badge: 'NONE',
      colors: [],
      sizes: [],
      stock: 5,
      isActive: true,
      isFeatured: false,
      prices: dualCurrencyPrices(3200),
      images: [
        {
          uploadId: 'u1',
          file: new File([new Uint8Array([1])], 'u1.png', {
            type: 'image/png',
          }),
        },
        {
          uploadId: 'u2',
          file: new File([new Uint8Array([2])], 'u2.png', {
            type: 'image/png',
          }),
        },
        {
          uploadId: 'u3',
          file: new File([new Uint8Array([3])], 'u3.png', {
            type: 'image/png',
          }),
        },
      ],
      imagePlan: [
        { uploadId: 'u2', isPrimary: false },
        { uploadId: 'u1', isPrimary: true },
        { uploadId: 'u3', isPrimary: false },
      ],
    });

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

    expect(created.imageUrl).toBe('https://example.com/u1.png');
    expect(created.primaryImage?.imageUrl).toBe('https://example.com/u1.png');
    expect(created.images.map(image => image.imageUrl)).toEqual([
      'https://example.com/u2.png',
      'https://example.com/u1.png',
      'https://example.com/u3.png',
    ]);
    expect(imageRows).toEqual([
      {
        imageUrl: 'https://example.com/u2.png',
        imagePublicId: 'products/u2',
        sortOrder: 0,
        isPrimary: false,
      },
      {
        imageUrl: 'https://example.com/u1.png',
        imagePublicId: 'products/u1',
        sortOrder: 1,
        isPrimary: true,
      },
      {
        imageUrl: 'https://example.com/u3.png',
        imagePublicId: 'products/u3',
        sortOrder: 2,
        isPrimary: false,
      },
    ]);
  });

  it('updateProduct can remove, reorder, add, and reassign primary photos safely', async () => {
    const productId = randomUUID();
    createdProductIds.push(productId);

    await db.insert(products).values({
      id: productId,
      slug: `photo-update-${randomUUID()}`,
      title: 'Photo update product',
      description: null,
      imageUrl: 'https://example.com/p1.png',
      imagePublicId: 'products/p1',
      price: toDbMoney(4500),
      originalPrice: null,
      currency: 'USD',
      category: null,
      type: null,
      colors: [],
      sizes: [],
      badge: 'NONE',
      isActive: true,
      isFeatured: false,
      stock: 6,
      sku: null,
    });

    await db
      .insert(productPrices)
      .values(dualCurrencyPriceRows(productId, 4500));

    const [primaryImage, secondaryImage] = await db
      .insert(productImages)
      .values([
        {
          productId,
          imageUrl: 'https://example.com/p1.png',
          imagePublicId: 'products/p1',
          sortOrder: 0,
          isPrimary: true,
        },
        {
          productId,
          imageUrl: 'https://example.com/p2.png',
          imagePublicId: 'products/p2',
          sortOrder: 1,
          isPrimary: false,
        },
      ])
      .returning();

    cloudinaryMocks.uploadProductImageFromFile.mockResolvedValueOnce({
      secureUrl: 'https://example.com/p3.png',
      publicId: 'products/p3',
    });

    const updated = await updateProduct(productId, {
      title: 'Updated photo product',
      imagePlan: [
        { imageId: secondaryImage.id, isPrimary: true },
        { uploadId: 'p3-upload', isPrimary: false },
      ],
      images: [
        {
          uploadId: 'p3-upload',
          file: new File([new Uint8Array([4])], 'p3.png', {
            type: 'image/png',
          }),
        },
      ],
    });

    const imageRows = await db
      .select({
        id: productImages.id,
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

    expect(updated.primaryImage?.imageUrl).toBe('https://example.com/p2.png');
    expect(updated.images.map(image => image.imageUrl)).toEqual([
      'https://example.com/p2.png',
      'https://example.com/p3.png',
    ]);
    expect(imageRows).toEqual([
      {
        id: secondaryImage.id,
        imageUrl: 'https://example.com/p2.png',
        imagePublicId: 'products/p2',
        sortOrder: 0,
        isPrimary: true,
      },
      {
        id: expect.any(String),
        imageUrl: 'https://example.com/p3.png',
        imagePublicId: 'products/p3',
        sortOrder: 1,
        isPrimary: false,
      },
    ]);
    expect(imageRows[1]?.id).not.toBe(primaryImage.id);
    expect(imageRows[1]?.id).not.toBe(secondaryImage.id);
    expect(productRow).toEqual({
      imageUrl: 'https://example.com/p2.png',
      imagePublicId: 'products/p2',
    });
    expect(cloudinaryMocks.destroyProductImage).toHaveBeenCalledTimes(1);
    expect(cloudinaryMocks.destroyProductImage).toHaveBeenNthCalledWith(
      1,
      primaryImage.imagePublicId
    );
  });

  it('updateProduct rejects photo plans that reference unknown existing images', async () => {
    const productId = randomUUID();
    createdProductIds.push(productId);

    await db.insert(products).values({
      id: productId,
      slug: `photo-invalid-${randomUUID()}`,
      title: 'Photo invalid product',
      description: null,
      imageUrl: 'https://example.com/p1.png',
      imagePublicId: 'products/p1',
      price: toDbMoney(2700),
      originalPrice: null,
      currency: 'USD',
      category: null,
      type: null,
      colors: [],
      sizes: [],
      badge: 'NONE',
      isActive: true,
      isFeatured: false,
      stock: 2,
      sku: null,
    });

    await db
      .insert(productPrices)
      .values(dualCurrencyPriceRows(productId, 2700));

    await expect(
      updateProduct(productId, {
        imagePlan: [{ imageId: randomUUID(), isPrimary: true }],
      })
    ).rejects.toBeInstanceOf(InvalidPayloadError);
  });

  it('updateProduct leaves legacy-only image state unchanged when photoPlan is omitted', async () => {
    const productId = randomUUID();
    const slug = `legacy-photo-noop-${randomUUID()}`;
    createdProductIds.push(productId);

    await db.insert(products).values({
      id: productId,
      slug,
      title: 'Legacy photo product',
      description: 'Original description',
      imageUrl: 'https://example.com/legacy-only.png',
      imagePublicId: 'products/legacy-only',
      price: toDbMoney(3100),
      originalPrice: null,
      currency: 'USD',
      category: null,
      type: null,
      colors: [],
      sizes: [],
      badge: 'NONE',
      isActive: true,
      isFeatured: false,
      stock: 7,
      sku: null,
    });

    await db
      .insert(productPrices)
      .values(dualCurrencyPriceRows(productId, 3100));

    const updated = await updateProduct(productId, {
      title: 'Legacy photo product renamed',
      description: 'Updated description',
    });

    const [productRow] = await db
      .select({
        imageUrl: products.imageUrl,
        imagePublicId: products.imagePublicId,
        title: products.title,
        description: products.description,
      })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    const imageRows = await db
      .select({
        id: productImages.id,
      })
      .from(productImages)
      .where(eq(productImages.productId, productId));

    expect(updated.imageUrl).toBe('https://example.com/legacy-only.png');
    expect(updated.primaryImage?.imageUrl).toBe(
      'https://example.com/legacy-only.png'
    );
    expect(updated.images).toHaveLength(1);
    expect(updated.images[0]?.id).toBe(`legacy:${productId}`);
    expect(productRow).toEqual({
      imageUrl: 'https://example.com/legacy-only.png',
      imagePublicId: 'products/legacy-only',
      title: 'Legacy photo product renamed',
      description: 'Updated description',
    });
    expect(imageRows).toEqual([]);
    expect(cloudinaryMocks.uploadProductImageFromFile).not.toHaveBeenCalled();
    expect(cloudinaryMocks.destroyProductImage).not.toHaveBeenCalled();
  });
});
