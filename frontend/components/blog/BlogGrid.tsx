'use client';

import { useTranslations } from 'next-intl';
import BlogCard from '@/components/blog/BlogCard';
import type { Post } from '@/components/blog/BlogFilters';

export default function BlogGrid({
  posts,
  selectedTags,
  onTagToggle,
}: {
  posts: Post[];
  selectedTags: string[];
  onTagToggle: (tag: string) => void;
}) {
  const t = useTranslations('blog');

  if (!posts.length) {
    return <p className="text-center text-gray-500">{t('noPosts')}</p>;
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-10">
      {posts.map(post => (
        <BlogCard
          key={post._id}
          post={post}
          selectedTags={selectedTags}
          onTagToggle={onTagToggle}
        />
      ))}
    </div>
  );
}
