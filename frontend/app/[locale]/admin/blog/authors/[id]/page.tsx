import { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BlogAuthorForm } from '@/components/admin/blog/BlogAuthorForm';
import { getAdminBlogAuthorById } from '@/db/queries/blog/admin-blog';
import { Link } from '@/i18n/routing';
import { issueCsrfToken } from '@/lib/security/csrf';

export const metadata: Metadata = {
  title: 'Edit Author | DevLovers',
};

export default async function AdminBlogAuthorEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const author = await getAdminBlogAuthorById(id);
  if (!author) notFound();

  const csrfTokenAuthor = issueCsrfToken('admin:blog-author:update');
  const csrfTokenImage = issueCsrfToken('admin:blog:image');

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6">
        <Link
          href="/admin/blog/authors"
          className="text-muted-foreground hover:text-foreground text-sm transition-colors"
        >
          &larr; Back to authors
        </Link>
      </div>

      <h1 className="text-foreground mb-6 text-2xl font-bold">Edit Author</h1>

      <BlogAuthorForm
        initialData={author}
        csrfTokenAuthor={csrfTokenAuthor}
        csrfTokenImage={csrfTokenImage}
      />
    </div>
  );
}
