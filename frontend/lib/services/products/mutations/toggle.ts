// frontend/lib/services/products/mutations/toggle.ts
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { products } from '@/db/schema';
import type { DbProduct } from '@/lib/types/shop';

import { mapRowToProduct } from '../mapping';

export async function toggleProductStatus(id: string): Promise<DbProduct> {
  const [current] = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);

  if (!current) {
    throw new Error('PRODUCT_NOT_FOUND');
  }

  const [updated] = await db
    .update(products)
    .set({ isActive: !current.isActive })
    .where(eq(products.id, id))
    .returning();

  return mapRowToProduct(updated);
}
