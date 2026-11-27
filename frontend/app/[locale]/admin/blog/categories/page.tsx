import { Metadata } from 'next';

import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { BlogCategoryManager } from '@/components/admin/blog/BlogCategoryManager';
import { getAdminBlogCategoriesFull } from '@/db/queries/blog/admin-blog';
import { issueCsrfToken } from '@/lib/security/csrf';

export const metadata: Metadata = {
  title: 'Categories | Admin | DevLovers',
};

export default async function AdminBlogCategoriesPage() {
  const categories = await getAdminBlogCategoriesFull();
  const csrfTokenCreate = issueCsrfToken('admin:blog-category:create');
  const csrfTokenUpdate = issueCsrfToken('admin:blog-category:update');
  const csrfTokenDelete = issueCsrfToken('admin:blog-category:delete');
  const csrfTokenReorder = issueCsrfToken('admin:blog-category:reorder');

  return (
    <AdminPageContainer>
      <BlogCategoryManager
        categories={categories}
        csrfTokenCreate={csrfTokenCreate}
        csrfTokenUpdate={csrfTokenUpdate}
        csrfTokenDelete={csrfTokenDelete}
        csrfTokenReorder={csrfTokenReorder}
      />
    </AdminPageContainer>
  );
}

