// frontend/app/[locale]/shop/admin/products/[id]/edit/page.tsx
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { guardShopAdminPage } from '@/lib/auth/guard-shop-admin-page';
import { ShopAdminTopbar } from '@/components/shop/admin/shop-admin-topbar';

import { ProductForm } from '../../_components/product-form';
import { db } from '@/db';
import { products, productPrices } from '@/db/schema';
import type { CurrencyCode } from '@/lib/shop/currency';
import { currencyValues } from '@/lib/shop/currency';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ id: z.string().uuid() });

function parseMajorToMinor(value: string | number): number {
  const s = String(value).trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    throw new Error(`Invalid money value: "${value}"`);
  }
  const [whole, frac = ''] = s.split('.');
  const frac2 = (frac + '00').slice(0, 2);
  return Number(whole) * 100 + Number(frac2);
}

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await guardShopAdminPage();

  const rawParams = await params;
  const parsed = paramsSchema.safeParse(rawParams);
  if (!parsed.success) notFound();

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, parsed.data.id))
    .limit(1);

  if (!product) notFound();

  const prices = await db
    .select({
      currency: productPrices.currency,
      price: productPrices.price,
      originalPrice: productPrices.originalPrice,
    })
    .from(productPrices)
    .where(eq(productPrices.productId, product.id));

  const initialPrices = prices.length
    ? prices
        .filter((p): p is typeof p & { currency: CurrencyCode } =>
          currencyValues.includes(p.currency as CurrencyCode)
        )
        .map(p => ({
          currency: p.currency as CurrencyCode,
          priceMinor: parseMajorToMinor(p.price),
          originalPriceMinor:
            p.originalPrice == null ? null : parseMajorToMinor(p.originalPrice),
        }))
    : [
        {
          currency: 'USD' as const,
          priceMinor: parseMajorToMinor(product.price),
          originalPriceMinor:
            product.originalPrice == null
              ? null
              : parseMajorToMinor(product.originalPrice),
        },
      ];

  return (
    <>
      <ShopAdminTopbar />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <ProductForm
          mode="edit"
          productId={product.id}
          initialValues={{
            title: product.title,
            slug: product.slug,
            prices: initialPrices,
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
      </main>
    </>
  );
}
