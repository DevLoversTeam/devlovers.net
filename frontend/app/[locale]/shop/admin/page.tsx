import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ShopAdminTopbar } from '@/components/shop/admin/ShopAdminTopbar';
import { Link } from '@/i18n/routing';
import { guardShopAdminPage } from '@/lib/auth/guard-shop-admin-page';

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
            className="text-foreground text-2xl font-bold"
          >
            {t('title')}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {t('description')}
          </p>
        </header>

        <section className="mt-6" aria-label="Admin sections">
          <ul className="grid gap-4 sm:grid-cols-2">
            <li>
              <Link
                href="/shop/admin/products"
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
                href="/shop/admin/orders"
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
    </>
  );
}
