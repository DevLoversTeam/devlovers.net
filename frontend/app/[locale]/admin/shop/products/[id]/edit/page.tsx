import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { Link } from '@/i18n/routing';
import { ProductNotFoundError } from '@/lib/errors/products';
import { issueCsrfToken } from '@/lib/security/csrf';
import { getAdminProductByIdWithPrices } from '@/lib/services/products';
import type { CurrencyCode } from '@/lib/shop/currency';
import { currencyValues } from '@/lib/shop/currency';

import { ProductForm } from '../../_components/ProductForm';

export const metadata: Metadata = {
  title: 'Edit Product | DevLovers',
  description: 'Edit an existing product in the DevLovers shop catalog.',
};

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
  const rawParams = await params;
  const parsed = paramsSchema.safeParse(rawParams);
  if (!parsed.success) notFound();

  let product;
  try {
    product = await getAdminProductByIdWithPrices(parsed.data.id);
  } catch (error) {
    if (error instanceof ProductNotFoundError) {
      notFound();
    }

    throw error;
  }

  const prices = product.prices;
  const t = await getTranslations('shop.admin.products');

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
  const csrfToken = issueCsrfToken('admin:products:update');

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <Link
          href="/admin/shop/products"
          className="text-muted-foreground hover:text-foreground text-sm transition-colors"
        >
          &larr; {t('backToList')}
        </Link>
      </div>

      <h1 className="text-foreground mb-6 text-2xl font-bold">
        {t('editProductHeading', { title: product.title })}
      </h1>

      <ProductForm
        mode="edit"
        productId={product.id}
        csrfToken={csrfToken}
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
          images: product.images,
        }}
      />
    </main>
  );
}
