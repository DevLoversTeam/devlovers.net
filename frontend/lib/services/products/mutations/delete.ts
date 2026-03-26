import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { productImages, productPrices, products } from '@/db/schema';
import { destroyProductImage } from '@/lib/cloudinary';
import { ProductNotFoundError } from '@/lib/errors/products';
import { logError } from '@/lib/logging';

export async function deleteProduct(id: string): Promise<void> {
  const { deletedProduct, publicIds } = await db.transaction(async tx => {
    const [existingProduct] = await tx
      .select({
        id: products.id,
        imagePublicId: products.imagePublicId,
      })
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (!existingProduct) {
      throw new ProductNotFoundError(id);
    }

    const imageRows = await tx
      .select({ imagePublicId: productImages.imagePublicId })
      .from(productImages)
      .where(eq(productImages.productId, id));

    await tx.delete(productPrices).where(eq(productPrices.productId, id));
    await tx.delete(products).where(eq(products.id, id));

    const publicIds = Array.from(
      new Set(
        [
          existingProduct.imagePublicId,
          ...imageRows.map(row => row.imagePublicId),
        ].filter(
          (value): value is string =>
            typeof value === 'string' && value.trim().length > 0
        )
      )
    );

    return {
      deletedProduct: existingProduct,
      publicIds,
    };
  });

  for (const publicId of publicIds) {
    try {
      await destroyProductImage(publicId);
    } catch (error) {
      logError('Failed to cleanup product image after delete', error, {
        productId: deletedProduct.id,
        imagePublicId: publicId,
      });
    }
  }
}
