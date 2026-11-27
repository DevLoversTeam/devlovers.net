import { Metadata } from 'next';

import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
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
    <AdminPageContainer>
      <AdminPageHeader
        title="Blog Posts"
        description="Manage blog posts, drafts, and publishing"
      >
        <Link
          href="/admin/blog/new"
          className="bg-foreground text-background hover:bg-foreground/90 inline-flex items-center rounded-md px-4 py-2 text-sm font-medium transition-colors"
        >
          + New Post
        </Link>
      </AdminPageHeader>

      <div className="mt-6">
        <BlogPostListTable posts={posts} csrfTokenDelete={csrfTokenDelete}  csrfTokenPublish={csrfTokenPublish}/>
      </div>
    </AdminPageContainer>
  );
}
