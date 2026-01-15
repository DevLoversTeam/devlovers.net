import { Link } from '@/i18n/routing';

export function ShopAdminTopbar() {
  return (
    <div className="border-b border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/shop/admin"
              className="text-sm font-semibold text-foreground hover:underline"
            >
              Admin
            </Link>

            <span className="text-muted-foreground">/</span>

            <Link
              href="/shop/admin/products"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Products
            </Link>

            <Link
              href="/shop/admin/orders"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Orders
            </Link>
          </div>

          <Link
            href="/shop"
            className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Back to shop
          </Link>
        </div>
      </div>
    </div>
  );
}
