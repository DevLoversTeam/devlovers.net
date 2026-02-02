import { Link } from '@/i18n/routing';
import { getTranslations } from 'next-intl/server';

export async function ShopAdminTopbar() {
  const t = await getTranslations('shop.admin.topbar');

  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <nav
          aria-label={t('label')}
          className="flex flex-wrap items-center justify-between gap-3 py-3"
        >
          <ol className="flex min-w-0 flex-wrap items-center gap-3">
            <li>
              <Link
                href="/shop/admin"
                className="text-sm font-semibold text-foreground hover:underline"
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
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                {t('products')}
              </Link>
            </li>

            <li>
              <Link
                href="/shop/admin/orders"
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                {t('orders')}
              </Link>
            </li>
          </ol>

          <div className="shrink-0 whitespace-nowrap">
            <Link
              href="/shop"
              className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              {t('backToShop')}
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
