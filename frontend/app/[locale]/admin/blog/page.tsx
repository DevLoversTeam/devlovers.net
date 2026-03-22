import { Metadata } from 'next';

import { BlogPostListTable } from '@/components/admin/blog/BlogPostListTable';
import { getAdminBlogList } from '@/db/queries/blog/admin-blog';
import { Link } from '@/i18n/routing';
import { issueCsrfToken } from '@/lib/security/csrf';

export const metadata: Metadata = {
  title: 'Blog Posts | Admin | DevLovers',
};

export default async function AdminBlogPage() {
  const posts = await getAdminBlogList();
  const csrfTokenDelete = issueCsrfToken('admin:blog:delete');
  const csrfTokenPublish = issueCsrfToken('admin:blog:toggle-publish');

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-foreground text-2xl font-bold">Blog Posts</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage blog posts, drafts, and publishing
          </p>
        </div>
        <Link
          href="/admin/blog/new"
          className="bg-foreground text-background hover:bg-foreground/90 inline-flex items-center rounded-md px-4 py-2 text-sm font-medium transition-colors"
        >
          + New Post
        </Link>
      </div>

      <div className="mt-6">
        <BlogPostListTable posts={posts} csrfTokenDelete={csrfTokenDelete}  csrfTokenPublish={csrfTokenPublish}/>
      </div>
    </div>
  );
}
