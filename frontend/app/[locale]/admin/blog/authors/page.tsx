import { Metadata } from 'next';

import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { BlogAuthorListTable } from '@/components/admin/blog/BlogAuthorListTable';
import { getAdminBlogAuthorsFull } from '@/db/queries/blog/admin-blog';
import { Link } from '@/i18n/routing';
import { issueCsrfToken } from '@/lib/security/csrf';

export const metadata: Metadata = {
  title: 'Authors | Admin | DevLovers',
};

export default async function AdminBlogAuthorsPage() {
  const authors = await getAdminBlogAuthorsFull();
  const csrfTokenDelete = issueCsrfToken('admin:blog-author:delete');

  return (
    <AdminPageContainer>
      <AdminPageHeader
        title="Authors"
        description="Manage blog authors and their profiles"
      >
        <Link
          href="/admin/blog/authors/new"
          className="bg-foreground text-background hover:bg-foreground/90 inline-flex items-center rounded-md px-4 py-2 text-sm font-medium transition-colors"
        >
          + New Author
        </Link>
      </AdminPageHeader>

      <div className="mt-6">
        <BlogAuthorListTable authors={authors} csrfTokenDelete={csrfTokenDelete} />
      </div>
    </AdminPageContainer>
  );
}

