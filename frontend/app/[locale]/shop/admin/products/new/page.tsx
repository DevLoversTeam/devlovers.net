import { ProductForm } from '../_components/product-form';
import { ShopAdminTopbar } from '@/components/shop/admin/shop-admin-topbar';
import { guardShopAdminPage } from '@/lib/auth/guard-shop-admin-page';

export default async function NewProductPage() {
  await guardShopAdminPage();

  return (
    <>
      <ShopAdminTopbar />
      <ProductForm mode="create" />
    </>
  );
}
