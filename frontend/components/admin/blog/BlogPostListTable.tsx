'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import type { AdminBlogListItem } from '@/db/queries/blog/admin-blog';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';

const TH =
  'px-3 py-2 text-left text-xs font-semibold text-foreground whitespace-nowrap';
const TD = 'px-3 py-2 text-sm';

type BlogStatus = 'draft' | 'published' | 'scheduled';

function getStatus(post: AdminBlogListItem): BlogStatus {
  if (!post.isPublished) return 'draft';
  if (post.scheduledPublishAt && new Date(post.scheduledPublishAt) > new Date())
    return 'scheduled';
  return 'published';
}

function StatusBadge({ status }: { status: BlogStatus }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
        status === 'draft' && 'bg-amber-500/10 text-amber-500',
        status === 'published' && 'bg-emerald-500/10 text-emerald-500',
        status === 'scheduled' && 'bg-sky-500/10 text-sky-500'
      )}
    >
      {status === 'draft' && 'Draft'}
      {status === 'published' && 'Published'}
      {status === 'scheduled' && 'Scheduled'}
    </span>
  );
}

function formatDate(date: Date | null): string {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

interface BlogPostListTableProps {
  posts: AdminBlogListItem[];
  csrfTokenDelete: string;
  csrfTokenPublish: string;
}

export function BlogPostListTable({
  posts,
  csrfTokenDelete,
  csrfTokenPublish,
}: BlogPostListTableProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const canDelete = (post: AdminBlogListItem) => !post.isPublished;

  async function handleDelete(postId: string) {
    if (!confirm('Delete this draft post?')) return;

    setDeletingId(postId);
    try {
      const res = await fetch(`/api/admin/blog/${postId}`, {
        method: 'DELETE',
        headers: { 'x-csrf-token': csrfTokenDelete },
      });
           if (res.ok) {
        router.refresh();
      } else {
        toast.error('Failed to delete post');
      }
    } finally {
      setDeletingId(null);
    }
  }

  async function handleTogglePublish(postId: string, currentlyPublished: boolean) {
    const action = currentlyPublished ? 'Unpublish' : 'Publish';
    if (!confirm(`${action} this post?`)) return;

    setTogglingId(postId);
    try {
      const res = await fetch(`/api/admin/blog/${postId}`, {
        method: 'PATCH',
        headers: { 'x-csrf-token': csrfTokenPublish },
      });
      if (res.ok) {
        router.refresh();
      } else {
        toast.error('Failed to toggle publish status');
      }

    } finally {
      setTogglingId(null);
    }
  }


  if (posts.length === 0) {
    return (
      <div className="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
        No blog posts found
      </div>
    );
  }

  return (
    <>
      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {posts.map(post => {
          const status = getStatus(post);
          return (
            <div
              key={post.id}
              className="border-border bg-background rounded-lg border p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-foreground truncate text-sm font-semibold">
                    {post.title}
                  </div>
                  <div className="text-muted-foreground mt-0.5 text-xs">
                    {post.authorName ?? '-'}
                  </div>
                </div>
                <StatusBadge status={status} />
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">Published</dt>
                  <dd className="text-foreground">
                    {formatDate(post.publishedAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Updated</dt>
                  <dd className="text-foreground">
                    {formatDate(post.updatedAt)}
                  </dd>
                </div>
              </dl>

              <div className="mt-3 flex gap-2">
                  <button
                  type="button"
                  onClick={() => handleTogglePublish(post.id, post.isPublished)}
                  disabled={togglingId === post.id}
                  className={cn(
                    'inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                    post.isPublished
                      ? 'border-amber-500/30 text-amber-500 hover:bg-amber-500/10'
                      : 'border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10'
                  )}
                >
                  {togglingId === post.id
                    ? '...'
                    : post.isPublished
                      ? 'Unpublish'
                      : 'Publish'}
                </button>
                <Link
                  href={`/admin/blog/${post.id}/preview`}
                  target="_blank"
                  className="border-border text-foreground hover:bg-secondary inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium transition-colors"
                >
                  Preview
                </Link>
                <Link
                  href={`/admin/blog/${post.id}`}
                  className="border-border text-foreground hover:bg-secondary inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium transition-colors"
                >
                  Edit
                </Link>
                {canDelete(post) && (
                  <button
                    type="button"
                    onClick={() => handleDelete(post.id)}
                    disabled={deletingId !== null}
                    className="inline-flex items-center rounded-md border border-red-500/30 px-2 py-1 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                  >
                    {deletingId === post.id ? 'Deleting...' : 'Delete'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <table className="divide-border w-full divide-y text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className={TH}>Title</th>
              <th className={TH}>Author</th>
              <th className={TH}>Status</th>
              <th className={TH}>Published</th>
              <th className={TH}>Updated</th>
              <th className={cn(TH, 'text-center')}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {posts.map(post => {
              const status = getStatus(post);
              return (
                <tr key={post.id} className="hover:bg-muted/50">
                  <td className={cn(TD, 'text-foreground font-medium')}>
                    <div
                      className="max-w-[250px] truncate"
                      title={post.title}
                    >
                      {post.title}
                    </div>
                  </td>
                  <td className={cn(TD, 'text-muted-foreground')}>
                    {post.authorName ?? '-'}
                  </td>
                  <td className={TD}>
                    <StatusBadge status={status} />
                  </td>
                  <td
                    className={cn(
                      TD,
                      'text-muted-foreground whitespace-nowrap'
                    )}
                  >
                    {formatDate(post.publishedAt)}
                  </td>
                  <td
                    className={cn(
                      TD,
                      'text-muted-foreground whitespace-nowrap'
                    )}
                  >
                    {formatDate(post.updatedAt)}
                  </td>
                  <td className={TD}>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleTogglePublish(post.id, post.isPublished)}
                        disabled={togglingId === post.id}
                        className={cn(
                          'inline-flex w-20 justify-center items-center rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                          post.isPublished
                            ? 'border-amber-500/30 text-amber-500 hover:bg-amber-500/10'
                            : 'border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10'
                        )}
                      >
                        {togglingId === post.id
                          ? '...'
                          : post.isPublished
                            ? 'Unpublish'
                            : 'Publish'}
                      </button>
                      <Link
                        href={`/admin/blog/${post.id}/preview`}
                        target="_blank"
                        className="border-border text-foreground hover:bg-secondary inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium transition-colors"
                      >
                        Preview
                      </Link>
                      <Link
                        href={`/admin/blog/${post.id}`}
                        className="border-border text-foreground hover:bg-secondary inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium transition-colors"
                      >
                        Edit
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(post.id)}
                        disabled={post.isPublished || deletingId !== null}
                        title={post.isPublished ? 'Unpublish first to delete' : 'Delete post'}
                        className={cn(
                          'inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium transition-colors',
                          post.isPublished
                            ? 'cursor-not-allowed border-red-500/10 text-red-500/40'
                            : 'border-red-500/30 text-red-500 enabled:hover:bg-red-500/10 disabled:opacity-50'
                        )}
                      >
                        {deletingId === post.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
