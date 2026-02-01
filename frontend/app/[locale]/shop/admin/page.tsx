import { Link } from '@/i18n/routing';
import { getTranslations } from 'next-intl/server';

import { ShopAdminTopbar } from '@/components/shop/admin/shop-admin-topbar';
import { guardShopAdminPage } from '@/lib/auth/guard-shop-admin-page';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Shop Admin | DevLovers',
  description: 'Manage products, orders, and settings for your shop.',
};

export const dynamic = 'force-dynamic';

export default async function ShopAdminHomePage() {
  await guardShopAdminPage();
  const t = await getTranslations('shop.admin.page');

  return (
    <>
      <ShopAdminTopbar />

      <main
        className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"
        aria-labelledby="shop-admin-title"
      >
        <header>
          <h1
            id="shop-admin-title"
            className="text-2xl font-bold text-foreground"
          >
            {t('title')}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('description')}
          </p>
        </header>

        <section className="mt-6" aria-label="Admin sections">
          <ul className="grid gap-4 sm:grid-cols-2">
            <li>
              <Link
                href="/shop/admin/products"
                className="block rounded-lg border border-border p-4 transition-colors hover:bg-muted/50"
              >
                <div className="text-base font-semibold text-foreground">
                  {t('productsSection.title')}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {t('productsSection.description')}
                </div>
              </Link>
            </li>

            <li>
              <Link
                href="/shop/admin/orders"
                className="block rounded-lg border border-border p-4 transition-colors hover:bg-muted/50"
              >
                <div className="text-base font-semibold text-foreground">
                  {t('ordersSection.title')}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {t('ordersSection.description')}
                </div>
              </Link>
            </li>
          </ul>
        </section>
      </main>
    </>
  );
}
