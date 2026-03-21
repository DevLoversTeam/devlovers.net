'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import type { AdminBlogAuthorListItem } from '@/db/queries/blog/admin-blog';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';

const TH =
  'px-3 py-2 text-left text-xs font-semibold text-foreground whitespace-nowrap';
const TD = 'px-3 py-2 text-sm';

interface BlogAuthorListTableProps {
  authors: AdminBlogAuthorListItem[];
  csrfTokenDelete: string;
}

export function BlogAuthorListTable({
  authors,
  csrfTokenDelete,
}: BlogAuthorListTableProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(authorId: string) {
    if (!confirm('Delete this author?')) return;

    setDeletingId(authorId);
    try {
      const res = await fetch(`/api/admin/blog/authors/${authorId}`, {
        method: 'DELETE',
        headers: { 'x-csrf-token': csrfTokenDelete },
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(
          data.code === 'HAS_POSTS'
            ? 'Author has posts assigned. Remove them first.'
            : 'Failed to delete author'
        );
      }
    }  catch {
      toast.error('Failed to delete author');
    } finally {
      setDeletingId(null);
    }
  }

  if (authors.length === 0) {
    return (
      <div className="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
        No authors found. Create one to get started.
      </div>
    );
  }

  return (
    <>
      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {authors.map(author => (
          <div
            key={author.id}
            className="border-border bg-background rounded-lg border p-4"
          >
            <div className="flex items-center gap-3">
              {author.imageUrl ? (
                <img
                  src={author.imageUrl}
                  alt=""
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <div className="bg-muted flex h-8 w-8 items-center justify-center rounded-full text-xs">
                  ?
                </div>
              )}
              <div className="min-w-0">
                <div className="text-foreground truncate text-sm font-semibold">
                  {author.name}
                </div>
                <div className="text-muted-foreground text-xs">
                  {author.jobTitle ?? '-'}
                </div>
              </div>
            </div>

            <div className="text-muted-foreground mt-2 text-xs">
              {author.postCount} {author.postCount === 1 ? 'post' : 'posts'}
            </div>

            <div className="mt-3 flex gap-2">
              <Link
                href={`/admin/blog/authors/${author.id}`}
                className="border-border text-foreground hover:bg-secondary inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium transition-colors"
              >
                Edit
              </Link>
              <button
                type="button"
                onClick={() => handleDelete(author.id)}
                disabled={author.postCount > 0 || deletingId === author.id}
                title={author.postCount > 0 ? `Author has ${author.postCount} posts` : 'Delete author'}
                className={cn(
                  'inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium transition-colors',
                  author.postCount > 0
                    ? 'cursor-not-allowed border-red-500/10 text-red-500/40'
                    : 'border-red-500/30 text-red-500 enabled:hover:bg-red-500/10 disabled:opacity-50'
                )}
              >
                {deletingId === author.id ? '...' : 'Delete'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <table className="divide-border w-full divide-y text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className={TH}>Photo</th>
              <th className={TH}>Name</th>
              <th className={TH}>Job Title</th>
              <th className={TH}>Posts</th>
              <th className={cn(TH, 'text-center')}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {authors.map(author => (
              <tr key={author.id} className="hover:bg-muted/50">
                <td className={TD}>
                  {author.imageUrl ? (
                    <img
                      src={author.imageUrl}
                      alt=""
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="bg-muted flex h-8 w-8 items-center justify-center rounded-full text-xs">
                      ?
                    </div>
                  )}
                </td>
                <td className={cn(TD, 'text-foreground font-medium')}>
                  {author.name}
                </td>
                <td className={cn(TD, 'text-muted-foreground')}>
                  {author.jobTitle ?? '-'}
                </td>
                <td className={cn(TD, 'text-muted-foreground')}>
                  {author.postCount}
                </td>
                <td className={TD}>
                  <div className="flex justify-center gap-2">
                    <Link
                      href={`/admin/blog/authors/${author.id}`}
                      className="border-border text-foreground hover:bg-secondary inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium transition-colors"
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDelete(author.id)}
                      disabled={author.postCount > 0 || deletingId === author.id}
                      title={author.postCount > 0 ? `Author has ${author.postCount} posts` : 'Delete author'}
                      className={cn(
                        'inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium transition-colors',
                        author.postCount > 0
                          ? 'cursor-not-allowed border-red-500/10 text-red-500/40'
                          : 'border-red-500/30 text-red-500 enabled:hover:bg-red-500/10 disabled:opacity-50'
                      )}
                    >
                      {deletingId === author.id ? '...' : 'Delete'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
