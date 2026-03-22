import { Metadata } from 'next';

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
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-foreground text-2xl font-bold">Authors</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage blog authors and their profiles
          </p>
        </div>
        <Link
          href="/admin/blog/authors/new"
          className="bg-foreground text-background hover:bg-foreground/90 inline-flex items-center rounded-md px-4 py-2 text-sm font-medium transition-colors"
        >
          + New Author
        </Link>
      </div>

      <div className="mt-6">
        <BlogAuthorListTable authors={authors} csrfTokenDelete={csrfTokenDelete} />
      </div>
    </div>
  );
}

