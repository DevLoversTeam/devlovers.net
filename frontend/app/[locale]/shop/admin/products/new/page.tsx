<<<<<<< HEAD
=======
import { Metadata } from 'next';

>>>>>>> 601e032c399164dfc128ab2dee5fe52dd66d2caf
import { ShopAdminTopbar } from '@/components/shop/admin/ShopAdminTopbar';
import { guardShopAdminPage } from '@/lib/auth/guard-shop-admin-page';
import { issueCsrfToken } from '@/lib/security/csrf';

import { ProductForm } from '../_components/ProductForm';
<<<<<<< HEAD
import { Metadata } from 'next';
=======
>>>>>>> 601e032c399164dfc128ab2dee5fe52dd66d2caf

export const metadata: Metadata = {
  title: 'New Product | DevLovers',
  description: 'Create a new product for the DevLovers shop catalog.',
};

export const dynamic = 'force-dynamic';

export default async function NewProductPage() {
  await guardShopAdminPage();
  const csrfToken = issueCsrfToken('admin:products:create');

  return (
    <>
      <ShopAdminTopbar />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <ProductForm mode="create" csrfToken={csrfToken} />
      </main>
    </>
  );
}
