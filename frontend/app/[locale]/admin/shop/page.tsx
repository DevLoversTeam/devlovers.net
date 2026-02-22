import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/routing';

export const metadata: Metadata = {
  title: 'Shop Admin | DevLovers',
  description: 'Manage products, orders, and settings for your shop.',
};

export default async function ShopAdminHomePage() {
  const t = await getTranslations('shop.admin.page');

  return (
    <main
      className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"
      aria-labelledby="shop-admin-title"
    >
      <header>
        <h1
          id="shop-admin-title"
          className="text-foreground text-2xl font-bold"
        >
          {t('title')}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">{t('description')}</p>
      </header>

      <section className="mt-6" aria-label="Admin sections">
        <ul className="grid gap-4 sm:grid-cols-2">
          <li>
            <Link
              href="/admin/shop/products"
              className="border-border hover:bg-muted/50 block rounded-lg border p-4 transition-colors"
            >
              <div className="text-foreground text-base font-semibold">
                {t('productsSection.title')}
              </div>
              <div className="text-muted-foreground mt-1 text-sm">
                {t('productsSection.description')}
              </div>
            </Link>
          </li>

          <li>
            <Link
              href="/admin/shop/orders"
              className="border-border hover:bg-muted/50 block rounded-lg border p-4 transition-colors"
            >
              <div className="text-foreground text-base font-semibold">
                {t('ordersSection.title')}
              </div>
              <div className="text-muted-foreground mt-1 text-sm">
                {t('ordersSection.description')}
              </div>
            </Link>
          </li>
        </ul>
      </section>
    </main>
  );
}
