import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { products } from '@/db/schema';
import { ProductNotFoundError } from '@/lib/errors/products';
import type { DbProduct } from '@/lib/types/shop';

import { mapRowToProduct } from '../mapping';

export async function toggleProductStatus(id: string): Promise<DbProduct> {
  const [current] = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);

  if (!current) {
    throw new ProductNotFoundError(id);
  }

  const [updated] = await db
    .update(products)
    .set({ isActive: !current.isActive })
    .where(eq(products.id, id))
    .returning();

  if (!updated) {
    throw new ProductNotFoundError(id);
  }

  return mapRowToProduct(updated);
}
