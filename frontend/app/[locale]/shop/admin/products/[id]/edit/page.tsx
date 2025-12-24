import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { ProductForm } from '../../_components/product-form';
import { db } from '@/db';
import { products } from '@/db/schema';

const paramsSchema = z.object({ id: z.uuid() });

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const rawParams = await params;
  const parsed = paramsSchema.safeParse(rawParams);

  if (!parsed.success) {
    return notFound();
  }

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, parsed.data.id))
    .limit(1);

  if (!product) {
    return notFound();
  }

  return (
    <ProductForm
      mode="edit"
      productId={product.id}
      initialValues={{
        title: product.title,
        slug: product.slug,
        prices: (product as any).prices?.length
          ? (product as any).prices.map((p: any) => ({
              currency: p.currency,
              price: String(p.price),
              originalPrice:
                p.originalPrice == null ? null : String(p.originalPrice),
            }))
          : [
              {
                currency: 'USD',
                price: String(product.price),
                originalPrice:
                  product.originalPrice == null
                    ? null
                    : String(product.originalPrice),
              },
            ],

        description: product.description ?? undefined,
        category: product.category ?? undefined,
        type: product.type ?? undefined,
        colors: product.colors ?? [],
        sizes: product.sizes ?? [],
        badge: product.badge ?? undefined,
        isActive: product.isActive,
        isFeatured: product.isFeatured,
        stock: product.stock,
        sku: product.sku ?? undefined,
        imageUrl: product.imageUrl,
      }}
    />
  );
}
