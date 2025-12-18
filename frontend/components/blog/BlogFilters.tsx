'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import BlogGrid from '@/components/blog/BlogGrid';

type SocialLink = {
  platform?: string;
  url?: string;
  _key?: string;
};

type Author = {
  name?: string;
  image?: string;
  company?: string;
  jobTitle?: string;
  city?: string;
  bio?: any;
  socialMedia?: SocialLink[];
};

export type Post = {
  _id: string;
  title: string;
  slug: { current: string };
  publishedAt?: string;
  tags?: string[];
  categories?: string[];
  resourceLink?: string;
  mainImage?: string;
  body?: any[];
  author?: Author;
};


export function normalizeTag(input: string) {
  return (input || '')
    .replace(/^#/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}


export default function BlogFilters({ posts }: { posts: Post[] }) {
  const t = useTranslations('blog');
  const [input, setInput] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const addTag = (raw: string) => {
    const norm = normalizeTag(raw);
    if (!norm) return;
    setSelectedTags(prev => (prev.includes(norm) ? prev : [...prev, norm]));
    setInput('');
  };

  const removeTag = (tag: string) => {
    setSelectedTags(prev => prev.filter(t => t !== tag));
  };

  const toggleTag = (raw: string) => {
    const norm = normalizeTag(raw);
    if (!norm) return;

    setSelectedTags(prev =>
      prev.includes(norm) ? prev.filter(t => t !== norm) : [...prev, norm]
    );
  };

  const clearAll = () => {
    setSelectedTags([]);
    setInput('');
  };

  const filteredPosts = useMemo(() => {
    if (!selectedTags.length) return posts;

    return posts.filter(post => {
      const postTags = (post.tags || []).map(normalizeTag);
      return selectedTags.every(t => postTags.includes(t));
    });
  }, [posts, selectedTags]);

  const showControls = selectedTags.length > 0 || input.trim().length > 0;

  return (
    <div className="mt-8">
      <div className="max-w-3xl mx-auto">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag(input);
            }
          }}
          placeholder={t('searchPlaceholder')}
          className="w-full rounded-3xl border border-gray-200 bg-white px-6 py-4 text-lg shadow-sm outline-none focus:ring-2 focus:ring-blue-200"
        />

        {showControls && (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {selectedTags.map(tag => (
              <button
                key={tag}
                type="button"
                onClick={() => removeTag(tag)}
                className="inline-flex items-center gap-2 rounded-md border border-purple-200 bg-purple-50 px-4 py-2 text-sm text-purple-700 hover:bg-purple-100 transition"
                title={t('removeTag')}
              >
                <span>#{tag}</span>
                <span className="text-base leading-none">×</span>
              </button>
            ))}

            {input.trim().length > 0 && (
              <button
                type="button"
                onClick={() => addTag(input)}
                className="rounded-md border border-gray-200 bg-white px-5 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
              >
                {t('add')}
              </button>
            )}

            {selectedTags.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="rounded-md border border-gray-200 bg-white px-5 py-2 text-sm text-gray-900 hover:bg-gray-50 transition"
              >
                {t('clear')}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-12">
        <BlogGrid
          posts={filteredPosts}
          selectedTags={selectedTags}
          onTagToggle={toggleTag}
        />
      </div>

      {!filteredPosts.length && (
        <p className="text-center text-gray-500 mt-10">
          {t('noPostsForTags')}
        </p>
      )}
    </div>
  );
}
