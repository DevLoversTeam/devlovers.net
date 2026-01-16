// frontend/app/[locale]/shop/admin/products/new/page.tsx
import { ShopAdminTopbar } from '@/components/shop/admin/shop-admin-topbar';
import { guardShopAdminPage } from '@/lib/auth/guard-shop-admin-page';

import { ProductForm } from '../_components/product-form';

export const dynamic = 'force-dynamic';

export default async function NewProductPage() {
  await guardShopAdminPage();

  return (
    <>
      <ShopAdminTopbar />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <ProductForm mode="create" />
      </main>
    </>
  );
}
