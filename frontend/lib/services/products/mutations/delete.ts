// frontend/lib/services/products/mutations/delete.ts
import { eq, sql } from 'drizzle-orm';

import { destroyProductImage } from '@/lib/cloudinary';
import { db } from '@/db';
import { products, productPrices } from '@/db/schema';
import { logError } from '@/lib/logging';

export async function deleteProduct(id: string): Promise<void> {
  const [existing] = await db
    .select({ id: products.id, imagePublicId: products.imagePublicId })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);

  if (!existing) {
    throw new Error('PRODUCT_NOT_FOUND');
  }

  // Atomic delete: prices first, then product, all-or-nothing.
  const result = await db.execute(sql`
    WITH del_prices AS (
      DELETE FROM ${productPrices}
      WHERE ${productPrices.productId} = ${id}
    ),
    del_product AS (
      DELETE FROM ${products}
      WHERE ${products.id} = ${id}
      RETURNING ${products.id} AS id
    )
    SELECT id FROM del_product;
  `);

  const rows =
    (result as unknown as { rows?: Array<{ id: string }> }).rows ?? [];
  if (rows.length === 0) {
    // concurrent delete edge-case
    throw new Error('PRODUCT_NOT_FOUND');
  }

  if (existing.imagePublicId) {
    try {
      await destroyProductImage(existing.imagePublicId);
    } catch (error) {
      logError('Failed to cleanup product image after delete', error);
    }
  }
}
