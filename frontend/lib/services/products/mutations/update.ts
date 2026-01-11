// frontend/lib/services/products/mutations/update.ts
import { eq, sql } from 'drizzle-orm';

import {
  destroyProductImage,
  uploadProductImageFromFile,
} from '@/lib/cloudinary';
import { db } from '@/db';
import { products, productPrices } from '@/db/schema';
import { logError } from '@/lib/logging';
import { toDbMoney } from '@/lib/shop/money';
import type { CurrencyCode } from '@/lib/shop/currency';
import type { DbProduct, ProductUpdateInput } from '@/lib/types/shop';

import { SlugConflictError } from '../../errors';
import { mapRowToProduct } from '../mapping';
import { normalizeSlug } from '../slug';
import {
  assertMoneyMinorInt,
  enforceSaleBadgeRequiresOriginal,
  normalizePricesFromInput,
  validatePriceRows,
} from '../prices';
import type { NormalizedPriceRow, ProductsTable } from '../types';

export async function updateProduct(
  id: string,
  input: ProductUpdateInput
): Promise<DbProduct> {
  const [existing] = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);

  if (!existing) {
    throw new Error('PRODUCT_NOT_FOUND');
  }

  const slug = await normalizeSlug(
    db,
    (input as any).slug ?? (input as any).title ?? existing.slug,
    { excludeId: id }
  );

  let uploaded: { secureUrl: string; publicId: string } | null = null;

  if ((input as any).image instanceof File && (input as any).image.size > 0) {
    try {
      uploaded = await uploadProductImageFromFile((input as any).image);
    } catch (error) {
      logError('Failed to upload replacement image', error);
      throw error;
    }
  }

  const prices = normalizePricesFromInput(input);
  if (prices.length) validatePriceRows(prices);
  // Enforce SALE invariant against FINAL state (DB rows + incoming upserts)
  const finalBadge = (input as any).badge ?? existing.badge;

  if (finalBadge === 'SALE') {
    const existingPriceRows = await db
      .select({
        currency: productPrices.currency,
        priceMinor: productPrices.priceMinor,
        originalPriceMinor: productPrices.originalPriceMinor,
      })
      .from(productPrices)
      .where(eq(productPrices.productId, id));

    const merged = new Map<CurrencyCode, NormalizedPriceRow>();

    for (const r of existingPriceRows) {
      merged.set(r.currency as CurrencyCode, {
        currency: r.currency as CurrencyCode,
        priceMinor: assertMoneyMinorInt(
          r.priceMinor,
          `${String(r.currency)} priceMinor`
        ),
        originalPriceMinor:
          r.originalPriceMinor == null
            ? null
            : assertMoneyMinorInt(
                r.originalPriceMinor,
                `${String(r.currency)} originalPriceMinor`
              ),
      });
    }

    for (const p of prices) {
      merged.set(p.currency, p);
    }

    enforceSaleBadgeRequiresOriginal('SALE', Array.from(merged.values()));
  }

  // Base fields update
  const updateData: Partial<ProductsTable['$inferInsert']> = {
    slug,
    title: (input as any).title ?? existing.title,
    description: (input as any).description ?? existing.description ?? null,
    imageUrl: uploaded ? uploaded.secureUrl : existing.imageUrl,
    imagePublicId: uploaded ? uploaded.publicId : existing.imagePublicId,

    category: (input as any).category ?? existing.category,
    type: (input as any).type ?? existing.type,
    colors: (input as any).colors ?? existing.colors,
    sizes: (input as any).sizes ?? existing.sizes,
    badge: (input as any).badge ?? existing.badge,
    isActive: (input as any).isActive ?? existing.isActive,
    isFeatured: (input as any).isFeatured ?? existing.isFeatured,
    stock: (input as any).stock ?? existing.stock,
    sku:
      (input as any).sku !== undefined
        ? (input as any).sku
          ? (input as any).sku
          : null
        : existing.sku,

    // legacy invariants: keep stable as USD mirror
    currency: 'USD',
    price: existing.price,
    originalPrice: existing.originalPrice,
  };

  // If USD provided in prices, update legacy mirror
  if (prices.length) {
    const usd = prices.find(p => p.currency === 'USD');
    if (usd?.priceMinor) {
      updateData.price = toDbMoney(usd.priceMinor);
      updateData.originalPrice =
        usd.originalPriceMinor == null
          ? null
          : toDbMoney(usd.originalPriceMinor);
      updateData.currency = 'USD';
    }
  }

  try {
    // 1) upsert prices 
    if (prices.length) {
      const upsertRows = prices.map(p => {
        const priceMinor = p.priceMinor;
        const originalMinor = p.originalPriceMinor;

        return {
          productId: id,
          currency: p.currency,
          priceMinor,
          originalPriceMinor: originalMinor,
          price: toDbMoney(priceMinor),
          originalPrice:
            originalMinor == null ? null : toDbMoney(originalMinor),
        };
      });

      await db
        .insert(productPrices)
        .values(upsertRows)
        .onConflictDoUpdate({
          target: [productPrices.productId, productPrices.currency],
          set: {
            priceMinor: sql`excluded.price_minor`,
            originalPriceMinor: sql`excluded.original_price_minor`,
            price: sql`excluded.price`,
            originalPrice: sql`excluded.original_price`,
            updatedAt: sql`now()`,
          },
        });
    }

    // 2) update products
    const [row] = await db
      .update(products)
      .set(updateData)
      .where(eq(products.id, id))
      .returning();

    if (!row) {
      throw new Error('PRODUCT_NOT_FOUND');
    }

    if (uploaded && existing.imagePublicId) {
      try {
        await destroyProductImage(existing.imagePublicId);
      } catch (cleanupError) {
        logError('Failed to cleanup old image after update', cleanupError);
      }
    }

    return mapRowToProduct(row);
  } catch (error) {
    // IMPORTANT: cleanup new image on failure (price upsert or product update)
    if (uploaded?.publicId) {
      try {
        await destroyProductImage(uploaded.publicId);
      } catch (cleanupError) {
        logError(
          'Failed to cleanup uploaded image after update failure',
          cleanupError
        );
      }
    }

    if ((error as { code?: string }).code === '23505') {
      throw new SlugConflictError('Slug already exists.');
    }
    throw error;
  }
}
