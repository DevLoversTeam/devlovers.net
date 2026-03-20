import { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BlogPostForm } from '@/components/admin/blog/BlogPostForm';
import {
  getAdminBlogAuthors,
  getAdminBlogCategories,
  getAdminBlogPostById,
} from '@/db/queries/blog/admin-blog';
import { Link } from '@/i18n/routing';
import { issueCsrfToken } from '@/lib/security/csrf';

export const metadata: Metadata = {
  title: 'Edit Post | DevLovers',
};

export default async function AdminBlogEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [post, authors, categories] = await Promise.all([
    getAdminBlogPostById(id),
    getAdminBlogAuthors(),
    getAdminBlogCategories(),
  ]);

  if (!post) notFound();

  const title = post.translations.en?.title ?? post.slug;

  const csrfTokenPost = issueCsrfToken('admin:blog:update');
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

      <h1 className="text-foreground mb-6 text-2xl font-bold">
        Edit: {title}
      </h1>

      <BlogPostForm
        postId={id}
        initialData={post}
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
