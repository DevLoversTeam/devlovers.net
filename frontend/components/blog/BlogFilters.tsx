'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import BlogGrid from '@/components/blog/BlogGrid';
import { Link } from '@/i18n/routing';

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

export type Author = {
  name?: string;
  image?: string;
  company?: string;
  jobTitle?: string;
  city?: string;
  bio?: PortableText;
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
type Category = {
  _id: string;
  title: string;
};

/**
 * Normalize a tag/search input:
 * - removes leading "#"
 * - trims spaces
 * - lowercases
 * - collapses multiple spaces
 */
export function normalizeTag(input: string) {
  return (input || '')
    .replace(/^#/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeAuthor(input: string) {
  return (input || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function plainTextFromPortableText(value?: PortableText): string {
  if (!Array.isArray(value)) return '';
  return value
    .filter(block => block?._type === 'block')
    .map(block =>
      (block.children || []).map(child => child.text || '').join('')
    )
    .join('\n')
    .trim();
}

function plainTextExcerpt(value?: PortableText): string {
  return plainTextFromPortableText(value);
}

/**
 * BlogFilters
 * - Renders BlogGrid with filtered posts
 */
export default function BlogFilters({
  posts,
  categories = [],
  featuredPost,
}: {
  posts: Post[];
  categories?: Category[];
  featuredPost?: Post;
}) {
  const t = useTranslations('blog');
  const tNav = useTranslations('navigation');
  const locale = useLocale();
  const searchParams = useSearchParams();
  const [selectedAuthor, setSelectedAuthor] = useState<{
    name: string;
    norm: string;
    data?: Author;
  } | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<{
    name: string;
    norm: string;
  } | null>(null);

  const toggleAuthor = (author: Author) => {
    const name = author.name || '';
    const norm = normalizeAuthor(name);
    if (!norm) return;
    setSelectedAuthor(prev =>
      prev?.norm === norm ? null : { name, norm, data: author }
    );
  };

  const clearAll = () => {
    setSelectedAuthor(null);
    setSelectedCategory(null);
  };
  const allCategories = useMemo(() => {
    if (categories.length) {
      return categories
        .map(category => ({
          norm: normalizeTag(category.title),
          name: category.title,
        }))
        .filter(category => category.norm);
    }

    const map = new Map<string, string>();
    for (const p of posts) {
      for (const c of p.categories || []) {
        const raw = (c || '').trim();
        const norm = normalizeTag(raw);
        if (norm && !map.has(norm)) map.set(norm, raw);
      }
    }
    return Array.from(map.entries())
      .map(([norm, name]) => ({ norm, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [posts, categories]);
  const categoryParam = useMemo(() => {
    return searchParams?.get('category') || '';
  }, [searchParams]);

  useEffect(() => {
    const normParam = normalizeTag(categoryParam);
    if (!normParam) {
      setSelectedCategory(null);
      return;
    }
    const matchedCategory = allCategories.find(
      category => category.norm === normParam
    );
    setSelectedCategory(prev => {
      if (prev?.norm === normParam) return prev;
      return {
        name: matchedCategory?.name || categoryParam,
        norm: normParam,
      };
    });
  }, [allCategories, categoryParam]);

  const filteredPosts = useMemo(() => {
    return posts.filter(post => {
      if (selectedAuthor) {
        const authorName = normalizeAuthor(post.author?.name || '');
        if (authorName !== selectedAuthor.norm) return false;
      }

      if (selectedCategory) {
        const postCategories = (post.categories || []).map(normalizeTag);
        if (!postCategories.includes(selectedCategory.norm)) return false;
      }

      return true;
    });
  }, [posts, selectedAuthor, selectedCategory]);

  const selectedAuthorData = selectedAuthor?.data || null;
  const authorBioText = useMemo(() => {
    return plainTextFromPortableText(selectedAuthorData?.bio);
  }, [selectedAuthorData]);

  return (
    <div className="mt-8">
      {!selectedAuthor && featuredPost && (
        <section className="mb-12">
          <div className="grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-center">
            {featuredPost.mainImage && (
              <Link
                href={`/blog/${featuredPost.slug.current}`}
                className="group relative block aspect-[4/3] overflow-hidden rounded-3xl shadow-[0_12px_30px_rgba(0,0,0,0.12)]"
              >
                <Image
                  src={featuredPost.mainImage}
                  alt={featuredPost.title}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
              </Link>
            )}
            <div className="pt-2">
              {featuredPost.categories?.[0] && (
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400 -mt-2">
                  {featuredPost.categories[0]}
                </div>
              )}
              <Link
                href={`/blog/${featuredPost.slug.current}`}
                className="mt-3 block text-3xl font-semibold leading-tight text-gray-900 transition hover:text-[#ff00ff] dark:text-gray-100"
              >
                {featuredPost.title}
              </Link>
              <p className="mt-4 text-base leading-relaxed text-gray-600 dark:text-gray-400">
                {plainTextExcerpt(featuredPost.body)}
              </p>
              {featuredPost.publishedAt && (
                <p className="mt-6 text-xs uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400">
                  {new Date(featuredPost.publishedAt).toLocaleDateString(
                    locale
                  )}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {selectedAuthor && (
        <div className="mb-10">
          <div className="mb-6 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <button
              type="button"
              onClick={clearAll}
              className="transition hover:text-[#ff00ff] hover:underline underline-offset-4"
            >
              {tNav('blog')}
            </button>
            <span>&gt;</span>
            <span className="text-gray-700 dark:text-gray-300">
              {selectedAuthor.name}
            </span>
          </div>

          {selectedAuthorData &&
            (selectedAuthorData.image || authorBioText) && (
              <div className="flex flex-col gap-6 md:flex-row md:items-start">
                {selectedAuthorData.image && (
                  <div className="relative h-40 w-40 flex-shrink-0 overflow-hidden rounded-xl">
                    <Image
                      src={selectedAuthorData.image}
                      alt={selectedAuthorData.name || t('author')}
                      fill
                      className="object-cover"
                    />
                  </div>
                )}
                <div className="min-w-0">
                  {selectedAuthorData.name && (
                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                      {selectedAuthorData.name}
                    </h2>
                  )}
                  {authorBioText && (
                    <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                      {authorBioText}
                    </p>
                  )}
                </div>
              </div>
            )}

          {selectedAuthorData?.name && (
            <div className="mt-10">
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                {t('articlesBy', { name: selectedAuthorData.name })}
              </h2>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {t('articlesPublished', { count: filteredPosts.length })}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="max-w-3xl mx-auto">
        {!selectedAuthor && allCategories.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setSelectedCategory(null)}
              className={
                !selectedCategory
                  ? 'rounded-full border border-[#ff00ff] bg-[#ff00ff]/10 px-4 py-2 text-sm font-medium text-[#ff00ff] transition'
                  : 'rounded-full border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'
              }
            >
              All
            </button>
            {allCategories.map(category => (
              <button
                key={category.norm}
                type="button"
                onClick={() =>
                  setSelectedCategory(prev =>
                    prev?.norm === category.norm
                      ? null
                      : { name: category.name, norm: category.norm }
                  )
                }
                className={
                  selectedCategory?.norm === category.norm
                    ? 'rounded-full border border-[#ff00ff] bg-[#ff00ff]/10 px-4 py-2 text-sm font-medium text-[#ff00ff] transition'
                    : 'rounded-full border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'
                }
              >
                {category.name}
              </button>
            ))}
          </div>
        )}

        {selectedCategory && null}
      </div>

      <div className="mt-12">
        <BlogGrid posts={filteredPosts} onAuthorSelect={toggleAuthor} />
      </div>

      {!filteredPosts.length && (
        <p className="text-center text-gray-500 mt-10">{t('noPosts')}</p>
      )}
    </div>
  );
}
