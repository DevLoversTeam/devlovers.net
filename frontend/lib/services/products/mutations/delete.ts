// frontend/lib/services/products/mutations/delete.ts
import { eq } from 'drizzle-orm';

import { destroyProductImage } from '@/lib/cloudinary';
import { db } from '@/db';
import { products } from '@/db/schema';
import { logError } from '@/lib/logging';

export async function deleteProduct(id: string): Promise<void> {
  const [existing] = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);

  if (!existing) {
    throw new Error('PRODUCT_NOT_FOUND');
  }

  await db.delete(products).where(eq(products.id, id));

  if (existing.imagePublicId) {
    try {
      await destroyProductImage(existing.imagePublicId);
    } catch (error) {
      logError('Failed to cleanup product image after delete', error);
    }
  }
}