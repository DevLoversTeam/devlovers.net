import { Metadata } from 'next';

import { BlogAuthorForm } from '@/components/admin/blog/BlogAuthorForm';
import { Link } from '@/i18n/routing';
import { issueCsrfToken } from '@/lib/security/csrf';

export const metadata: Metadata = {
  title: 'New Author | DevLovers',
};

export default async function AdminBlogAuthorNewPage() {
  const csrfTokenAuthor = issueCsrfToken('admin:blog-author:create');
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

      <h1 className="text-foreground mb-6 text-2xl font-bold">New Author</h1>

      <BlogAuthorForm
        csrfTokenAuthor={csrfTokenAuthor}
        csrfTokenImage={csrfTokenImage}
      />
    </div>
  );
}
