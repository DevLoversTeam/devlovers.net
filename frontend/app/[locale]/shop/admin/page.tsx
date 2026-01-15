import { Link } from '@/i18n/routing';
import { ShopAdminTopbar } from '@/components/shop/admin/shop-admin-topbar';
import { guardShopAdminPage } from '@/lib/auth/guard-shop-admin-page';

export default async function ShopAdminHomePage() {
  await guardShopAdminPage();
  return (
    <>
      <ShopAdminTopbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-foreground">Shop Admin</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Administrative tools for the merch shop.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Link
            href="/shop/admin/products"
            className="rounded-lg border border-border p-4 transition-colors hover:bg-muted/50"
          >
            <div className="text-base font-semibold text-foreground">
              Products
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              Create, edit, activate, feature.
            </div>
          </Link>

          <Link
            href="/shop/admin/orders"
            className="rounded-lg border border-border p-4 transition-colors hover:bg-muted/50"
          >
            <div className="text-base font-semibold text-foreground">
              Orders
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              Review and manage orders.
            </div>
          </Link>
        </div>
      </div>
    </>
  );
}
