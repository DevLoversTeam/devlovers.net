import { Metadata } from 'next';

import { issueCsrfToken } from '@/lib/security/csrf';

import { ProductForm } from '../_components/ProductForm';

export const metadata: Metadata = {
  title: 'New Product | DevLovers',
  description: 'Create a new product for the DevLovers shop catalog.',
};

export default async function NewProductPage() {
  const csrfToken = issueCsrfToken('admin:products:create');

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <ProductForm mode="create" csrfToken={csrfToken} />
    </main>
  );
}
