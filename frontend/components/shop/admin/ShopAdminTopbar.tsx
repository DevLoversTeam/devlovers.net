import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/routing';

export async function ShopAdminTopbar() {
  const t = await getTranslations('shop.admin.topbar');

  return (
    <header className="border-border bg-background border-b">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <nav
          aria-label={t('label')}
          className="flex flex-wrap items-center justify-between gap-3 py-3"
        >
          <ol className="flex min-w-0 flex-wrap items-center gap-3">
            <li>
              <Link
                href="/shop/admin"
                className="text-foreground text-sm font-semibold hover:underline"
              >
                {t('admin')}
              </Link>
            </li>

            <li aria-hidden="true" className="text-muted-foreground">
              /
            </li>

            <li>
              <Link
                href="/shop/admin/products"
                className="text-muted-foreground hover:text-foreground text-sm font-medium"
              >
                {t('products')}
              </Link>
            </li>

            <li>
              <Link
                href="/shop/admin/orders"
                className="text-muted-foreground hover:text-foreground text-sm font-medium"
              >
                {t('orders')}
              </Link>
            </li>
          </ol>

          <div className="shrink-0 whitespace-nowrap">
            <Link
              href="/shop"
              className="border-border text-foreground hover:bg-secondary inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
            >
              {t('backToShop')}
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
