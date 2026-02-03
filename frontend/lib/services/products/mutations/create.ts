import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { productPrices, products } from '@/db/schema';
import { uploadProductImageFromFile } from '@/lib/cloudinary';
import { logError } from '@/lib/logging';
import { toDbMoney } from '@/lib/shop/money';
import type { DbProduct, ProductInput } from '@/lib/types/shop';

import { InvalidPayloadError, SlugConflictError } from '../../errors';
import { mapRowToProduct } from '../mapping';
import {
  enforceSaleBadgeRequiresOriginal,
  normalizePricesFromInput,
  requireUsd,
  validatePriceRows,
} from '../prices';
import { normalizeSlug } from '../slug';

export async function createProduct(input: ProductInput): Promise<DbProduct> {
  const slug = await normalizeSlug(
    db,
    (input as any).slug ?? (input as any).title
  );

  let uploaded: { secureUrl: string; publicId: string } | null = null;

  try {
    uploaded = await uploadProductImageFromFile((input as any).image);
  } catch (error) {
    logError('Failed to upload product image', error);
    throw error;
  }

  const prices = normalizePricesFromInput(input);
  if (!prices.length) {
    throw new InvalidPayloadError('Product pricing is required.');
  }

  validatePriceRows(prices);

  const badge = (input as any).badge ?? 'NONE';
  enforceSaleBadgeRequiresOriginal(badge, prices);

  const usd = requireUsd(prices);

  let createdProductId: string | null = null;

  try {
    const [row] = await db
      .insert(products)
      .values({
        slug,
        title: (input as any).title,
        description: (input as any).description ?? null,
        imageUrl: uploaded?.secureUrl ?? '',
        imagePublicId: uploaded?.publicId,
        price: toDbMoney(usd.priceMinor),
        originalPrice:
          usd.originalPriceMinor == null
            ? null
            : toDbMoney(usd.originalPriceMinor),
        currency: 'USD',

        category: (input as any).category ?? null,
        type: (input as any).type ?? null,
        colors: (input as any).colors ?? [],
        sizes: (input as any).sizes ?? [],
        badge: (input as any).badge ?? 'NONE',
        isActive: (input as any).isActive ?? true,
        isFeatured: (input as any).isFeatured ?? false,
        stock: (input as any).stock ?? 0,
        sku: (input as any).sku ?? null,
      })
      .onConflictDoNothing({ target: products.slug })
      .returning();

    if (!row) {
      throw new SlugConflictError('Slug already exists.');
    }

    createdProductId = row.id;

    await db.insert(productPrices).values(
      prices.map(p => {
        const priceMinor = p.priceMinor;
        const originalMinor = p.originalPriceMinor;

        return {
          productId: row.id,
          currency: p.currency,
          priceMinor,
          originalPriceMinor: originalMinor,
          price: toDbMoney(priceMinor),
          originalPrice:
            originalMinor == null ? null : toDbMoney(originalMinor),
        };
      })
    );

    return mapRowToProduct(row);
  } catch (error) {
    if (createdProductId) {
      try {
        await db.delete(products).where(eq(products.id, createdProductId));
      } catch (cleanupDbError) {
        logError(
          'Failed to cleanup product after create failure',
          cleanupDbError
        );
      }
    }
    throw error;
  }
}
