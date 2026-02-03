import { sql } from 'drizzle-orm';

import { db } from '@/db';
import { productPrices,products } from '@/db/schema';
import { destroyProductImage } from '@/lib/cloudinary';
import { ProductNotFoundError } from '@/lib/errors/products';
import { logError } from '@/lib/logging';

export async function deleteProduct(id: string): Promise<void> {
  const result = await db.execute(sql`
    WITH del_prices AS (
      DELETE FROM ${productPrices}
      WHERE ${productPrices.productId} = ${id}
    ),
    del_product AS (
      DELETE FROM ${products}
      WHERE ${products.id} = ${id}
      RETURNING ${products.id} AS id, ${products.imagePublicId} AS imagePublicId
    )
    SELECT id, imagePublicId FROM del_product;
  `);

  const rows =
    (
      result as unknown as {
        rows?: Array<{ id: string; imagePublicId: string | null }>;
      }
    ).rows ?? [];

  const [deleted] = rows;

  if (!deleted) {
    throw new ProductNotFoundError(id);
  }

  if (deleted.imagePublicId) {
    try {
      await destroyProductImage(deleted.imagePublicId);
    } catch (error) {
      logError('Failed to cleanup product image after delete', error);
    }
  }
}
