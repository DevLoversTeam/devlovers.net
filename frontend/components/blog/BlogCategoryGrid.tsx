'use client';

import BlogGrid from '@/components/blog/BlogGrid';
import type { Post } from '@/components/blog/BlogFilters';

export function BlogCategoryGrid({ posts }: { posts: Post[] }) {
  if (!posts.length) return null;

  return (
    <BlogGrid
      posts={posts}
      onAuthorSelect={() => {}}
      disableHoverColor
    />
  );
}
