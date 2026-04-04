import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { productPrices, products } from '@/db/schema';
import { ProductNotFoundError } from '@/lib/errors/products';
import { InvalidPayloadError } from '@/lib/services/errors';
import type { DbProduct } from '@/lib/types/shop';

import { getProductImagesByProductId, resolveProductImages } from '../images';
import { mapRowToProduct } from '../mapping';
import { assertMergedPricesPolicy } from '../prices';

async function assertProductCanBeActivated(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  current: typeof products.$inferSelect
): Promise<void> {
  const priceRows = await tx
    .select({
      currency: productPrices.currency,
      priceMinor: productPrices.priceMinor,
      originalPriceMinor: productPrices.originalPriceMinor,
    })
    .from(productPrices)
    .where(eq(productPrices.productId, current.id));

  const mergedRows = priceRows.map(row => ({
    currency: row.currency,
    priceMinor: row.priceMinor,
    originalPriceMinor: row.originalPriceMinor,
  }));

  assertMergedPricesPolicy(mergedRows, {
    productId: current.id,
    requiredCurrency: 'UAH',
    requireUsd: false,
  });

  if (current.badge === 'SALE') {
    const invalidSaleRow = mergedRows.find(
      row =>
        row.originalPriceMinor == null ||
        row.originalPriceMinor <= row.priceMinor
    );

    if (invalidSaleRow) {
      const error = new InvalidPayloadError(
        'SALE badge requires original price for each provided currency.',
        {
          code: 'SALE_ORIGINAL_REQUIRED',
          field: 'prices',
          details: {
            currency: invalidSaleRow.currency,
            field: 'originalPriceMinor',
            rule:
              invalidSaleRow.originalPriceMinor == null
                ? 'required'
                : 'greater_than_price',
          },
        }
      );
      throw error;
    }
  }

  const resolvedImages = resolveProductImages(
    current,
    await getProductImagesByProductId(current.id, { db: tx })
  );

  if (!resolvedImages.primaryImage || !resolvedImages.imageUrl.trim()) {
    const error = new InvalidPayloadError(
      'At least one product photo is required.',
      {
        code: 'IMAGE_REQUIRED',
        field: 'photos',
        details: { productId: current.id },
      }
    );
    throw error;
  }
}

export async function toggleProductStatus(id: string): Promise<DbProduct> {
  const updated = await db.transaction(async tx => {
    const [current] = await tx
      .select()
      .from(products)
      .where(eq(products.id, id))
      .limit(1)
      .for('update');

    if (!current) {
      throw new ProductNotFoundError(id);
    }

    const nextIsActive = !current.isActive;
    if (nextIsActive) {
      await assertProductCanBeActivated(tx, current);
    }

    const [row] = await tx
      .update(products)
      .set({ isActive: nextIsActive })
      .where(eq(products.id, id))
      .returning();

    if (!row) {
      throw new ProductNotFoundError(id);
    }

    return row;
  });

  return await mapRowToProduct(updated);
}
