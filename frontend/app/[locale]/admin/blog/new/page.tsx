import { Metadata } from 'next';

import { BlogPostForm } from '@/components/admin/blog/BlogPostForm';
import {
  getAdminBlogAuthors,
  getAdminBlogCategories,
} from '@/db/queries/blog/admin-blog';
import { Link } from '@/i18n/routing';
import { issueCsrfToken } from '@/lib/security/csrf';

export const metadata: Metadata = {
  title: 'New Post | DevLovers',
};

export default async function AdminBlogNewPage() {
  const [authors, categories] = await Promise.all([
    getAdminBlogAuthors(),
    getAdminBlogCategories(),
  ]);

  const csrfTokenPost = issueCsrfToken('admin:blog:create');
  const csrfTokenCategory = issueCsrfToken('admin:blog-category:create');
  const csrfTokenAuthor = issueCsrfToken('admin:blog-author:create');
  const csrfTokenImage = issueCsrfToken('admin:blog:image');

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6">
        <Link
          href="/admin/blog"
          className="text-muted-foreground hover:text-foreground text-sm transition-colors"
        >
          &larr; Back to posts
        </Link>
      </div>

      <h1 className="text-foreground mb-6 text-2xl font-bold">New Post</h1>

      <BlogPostForm
        authors={authors}
        categories={categories}
        csrfTokenPost={csrfTokenPost}
        csrfTokenCategory={csrfTokenCategory}
        csrfTokenAuthor={csrfTokenAuthor}
        csrfTokenImage={csrfTokenImage}
      />
    </div>
  );
}
