'use client';

import { useCallback } from 'react';

import type { Author, Post } from '@/components/blog/BlogFilters';
import BlogGrid from '@/components/blog/BlogGrid';
import { useRouter } from '@/i18n/routing';

export function BlogCategoryGrid({ posts }: { posts: Post[] }) {
  const router = useRouter();

  const handleAuthorSelect = useCallback(
    (author: Author) => {
      const name = (author?.name || '').trim();
      if (!name) return;
      router.push(`/blog?author=${encodeURIComponent(name)}`);
    },
    [router]
  );

  if (!posts.length) return null;

  return (
    <BlogGrid
      posts={posts}
      onAuthorSelect={handleAuthorSelect}
      disableHoverColor
    />
  );
}
