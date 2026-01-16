// C:\Users\milka\devlovers.net-clean\frontend\components\shop\admin\shop-admin-topbar.tsx

import { Link } from '@/i18n/routing';

export function ShopAdminTopbar() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <nav
          aria-label="Shop admin"
          className="flex flex-wrap items-center justify-between gap-3 py-3"
        >
          <ol className="flex flex-wrap items-center gap-3">
            <li>
              <Link
                href="/shop/admin"
                className="text-sm font-semibold text-foreground hover:underline"
              >
                Admin
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
                Products
              </Link>
            </li>

            <li>
              <Link
                href="/shop/admin/orders"
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Orders
              </Link>
            </li>
          </ol>

          <div className="shrink-0">
            <Link
              href="/shop"
              className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              Back to shop
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
