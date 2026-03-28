import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/routing';
import { issueCsrfToken } from '@/lib/security/csrf';

import { ProductForm } from '../_components/ProductForm';

export const metadata: Metadata = {
  title: 'New Product | DevLovers',
  description: 'Create a new product for the DevLovers shop catalog.',
};

export default async function NewProductPage() {
  const csrfToken = issueCsrfToken('admin:products:create');
  const t = await getTranslations('shop.admin.products');

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6">
        <Link
          href="/admin/shop/products"
          className="text-muted-foreground hover:text-foreground text-sm transition-colors"
        >
          &larr; {t('backToList')}
        </Link>
      </div>

      <h1 className="text-foreground mb-6 text-2xl font-bold">
        {t('newProduct')}
      </h1>

      <ProductForm mode="create" csrfToken={csrfToken} />
    </main>
  );
}
