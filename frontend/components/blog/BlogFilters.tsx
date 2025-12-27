'use client';

import { useMemo, useState } from 'react';
import BlogGrid from '@/components/blog/BlogGrid';

type SocialLink = {
  platform?: string;
  url?: string;
  _key?: string;
};

export type PortableTextSpan = {
  _type: 'span';
  text?: string;
};

export type PortableTextBlock = {
  _type: 'block';
  _key?: string;
  children?: PortableTextSpan[];
};

export type PortableTextImage = {
  _type: 'image';
  _key?: string;
  url?: string;
};

export type PortableText = Array<PortableTextBlock | PortableTextImage>;

type Author = {
  name?: string;
  image?: string;
  company?: string;
  jobTitle?: string;
  city?: string;
  bio?: PortableText;
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
  body?: PortableText;
  author?: Author;
};

export function normalizeTag(input: string) {
  return (input || '')
    .replace(/^#/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className || 'h-6 w-6'}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M21 21l-4.3-4.3" />
      <circle cx="11" cy="11" r="7" />
    </svg>
  );
}

export default function BlogFilters({ posts }: { posts: Post[] }) {
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

  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const p of posts) {
      for (const t of p.tags || []) s.add(normalizeTag(t));
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [posts]);

  const inputTrim = input.trim();
  const inputNorm = normalizeTag(inputTrim);

  const suggestion = useMemo(() => {
    if (!inputNorm) return '';
    const match = allTags.find(t => t.startsWith(inputNorm));
    return match || '';
  }, [allTags, inputNorm]);

  const suggestionRemainder =
    suggestion && inputNorm && suggestion.startsWith(inputNorm)
      ? suggestion.slice(inputNorm.length)
      : '';

  const filteredPosts = useMemo(() => {
    if (!selectedTags.length) return posts;

    return posts.filter(post => {
      const postTags = (post.tags || []).map(normalizeTag);
      return selectedTags.every(t => postTags.includes(t));
    });
  }, [posts, selectedTags]);

  const showControls = selectedTags.length > 0 || inputTrim.length > 0;

  return (
    <div className="mt-8">
      <div className="max-w-3xl mx-auto">
        <div className="relative">
          <div className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-gray-400">
            <SearchIcon className="h-6 w-6" />
          </div>

          {inputTrim.length > 0 && suggestion && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex items-center pl-14 pr-6 text-lg whitespace-pre"
            >
              <span className="text-transparent">{inputTrim}</span>
              <span className="text-gray-400">{suggestionRemainder}</span>
            </div>
          )}

          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (
                e.key === 'Tab' &&
                suggestion &&
                inputNorm &&
                suggestionRemainder
              ) {
                e.preventDefault();
                setInput(suggestion);
                return;
              }

              if (e.key === 'Enter') {
                e.preventDefault();
                addTag(input);
              }
            }}
            placeholder="Пошук..."
            className="
              w-full
              rounded-xl
              border border-gray-200
              bg-white
              pl-14 pr-6 py-4
              text-lg text-gray-900
              shadow-sm
              outline-none
              placeholder-gray-400
              focus:placeholder-transparent
              focus:border-gray-400
              focus:ring-0
              focus:shadow-[0_0_0_2px_rgba(0,0,0,0.04)]
            "
          />
        </div>

        {showControls && (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {selectedTags.map(tag => (
              <button
                key={tag}
                type="button"
                onClick={() => removeTag(tag)}
                className="
                  inline-flex items-center gap-2
                  text-xs px-3 py-2 rounded-md
                  border border-gray-300 bg-gray-50
                  text-gray-600 hover:bg-gray-100
                  transition
                "
                title="Remove tag"
              >
                <span>#{tag}</span>
                <span className="text-base leading-none">×</span>
              </button>
            ))}

            {inputTrim.length > 0 && (
              <button
                type="button"
                onClick={() => addTag(input)}
                className="
                  rounded-md border border-gray-300 bg-white
                  px-5 py-2 text-sm text-gray-800
                  hover:bg-gray-50 hover:border-gray-400 transition
                "
              >
                Add
              </button>
            )}

            {selectedTags.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="
                  rounded-md border border-gray-300 bg-white
                  px-5 py-2 text-sm text-gray-800
                  hover:bg-gray-50 hover:border-gray-400 transition
                "
              >
                Clear
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
          No posts found for selected tags.
        </p>
      )}
    </div>
  );
}
