'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { usePathname, useRouter } from '@/i18n/routing';
import BlogGrid from '@/components/blog/BlogGrid';
import { Link } from '@/i18n/routing';
import { formatBlogDate } from '@/lib/blog/date';

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

export type SocialLink = {
  _key?: string;
  platform?: string;
  url?: string;
};

export type Author = {
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
      (block.children || []).map(child => child.text || '').join(' ')
    )
    .join('\n')
    .trim();
}

function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
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
  const router = useRouter();
  const pathname = usePathname();
  const [selectedAuthor, setSelectedAuthor] = useState<{
    name: string;
    norm: string;
    data?: Author;
  } | null>(null);
  const [authorProfile, setAuthorProfile] = useState<{
    name: string;
    data: Author;
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
    const params = new URLSearchParams(searchParams?.toString() || '');
    params.delete('author');
    params.delete('category');
    const nextPath = params.toString() ? `${pathname}?${params}` : pathname;
    router.replace(nextPath);
  };

  const getCategoryLabel = (categoryName: string): string => {
    const key = categoryName.toLowerCase() as 'tech' | 'career' | 'insights' | 'news' | 'growth';
    const categoryTranslations: Record<string, string> = {
      tech: t('categories.tech'),
      career: t('categories.career'),
      insights: t('categories.insights'),
      news: t('categories.news'),
      growth: t('categories.growth'),
    };
    return categoryTranslations[key] || categoryName;
  };

  const allCategories = useMemo(() => {
    if (categories.length) {
      return categories
        .map(category => ({
          norm: normalizeTag(category.title),
          name: category.title === 'Growth' ? 'Career' : category.title,
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
      .map(([norm, name]) => ({
        norm,
        name: name === 'Growth' ? 'Career' : name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [posts, categories]);
  const categoryParam = useMemo(() => {
    return searchParams?.get('category') || '';
  }, [searchParams]);
  const resolvedCategory = useMemo(() => {
    const normParam = normalizeTag(categoryParam);
    if (!normParam) return selectedCategory;
    const matched = allCategories.find(category => category.norm === normParam);
    return {
      name: matched?.name || categoryParam,
      norm: normParam,
    };
  }, [allCategories, categoryParam, selectedCategory]);
  const searchQuery = useMemo(() => {
    return (searchParams?.get('search') || '').trim();
  }, [searchParams]);
  const authorParam = useMemo(() => {
    return (searchParams?.get('author') || '').trim();
  }, [searchParams]);
  const searchQueryLower = searchQuery.toLowerCase();
  const didClearSearchRef = useRef(false);

  useEffect(() => {
    if (didClearSearchRef.current) return;
    if (!searchQuery) {
      didClearSearchRef.current = true;
      return;
    }
    if (typeof performance === 'undefined') return;
    const [navEntry] = performance.getEntriesByType('navigation');
    const navType = (navEntry as PerformanceNavigationTiming | undefined)?.type;
    if (navType !== 'reload') return;
    const params = new URLSearchParams(searchParams?.toString() || '');
    params.delete('search');
    const nextPath = params.toString() ? `${pathname}?${params}` : pathname;
    router.replace(nextPath);
    didClearSearchRef.current = true;
  }, [pathname, router, searchParams, searchQuery]);


  const resolvedAuthor = useMemo(() => {
    const normParam = normalizeAuthor(authorParam);
    if (!normParam) return selectedAuthor;
    if (selectedAuthor?.norm === normParam) return selectedAuthor;
    const match = posts.find(
      post => normalizeAuthor(post.author?.name || '') === normParam
    );
    return {
      name: match?.author?.name || authorParam,
      norm: normParam,
      data: match?.author,
    };
  }, [authorParam, posts, selectedAuthor]);

  useEffect(() => {
    const name = resolvedAuthor?.name?.trim();
    if (!name) return;

    let active = true;

    fetch(
      `/api/blog-author?name=${encodeURIComponent(name)}&locale=${encodeURIComponent(
        locale
      )}`,
      { cache: 'no-store' }
    )
      .then(response => (response.ok ? response.json() : null))
      .then((data: Author | null) => {
        if (!active) return;
        if (data) setAuthorProfile({ name, data });
      })
      .catch(() => {
        if (!active) return;
      });

    return () => {
      active = false;
    };
  }, [locale, resolvedAuthor?.name]);

  const filteredPosts = useMemo(() => {
    return posts.filter(post => {
      if (resolvedAuthor) {
        const authorName = normalizeAuthor(post.author?.name || '');
        if (authorName !== resolvedAuthor.norm) return false;
      }

      if (resolvedCategory) {
        const postCategories = (post.categories || []).map(normalizeTag);
        if (!postCategories.includes(resolvedCategory.norm)) return false;
      }

      if (searchQueryLower) {
        const titleText = normalizeSearchText(post.title);
        const bodyText = normalizeSearchText(
          plainTextFromPortableText(post.body)
        );
        if (
          !titleText.includes(searchQueryLower) &&
          !bodyText.includes(searchQueryLower)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [posts, resolvedAuthor, resolvedCategory, searchQueryLower]);

  const selectedAuthorData = useMemo(() => {
    const resolvedName = resolvedAuthor?.name;
    if (!resolvedName) return null;
    if (authorProfile?.name === resolvedName) return authorProfile.data;
    return resolvedAuthor?.data || null;
  }, [authorProfile, resolvedAuthor?.data, resolvedAuthor?.name]);
  const authorBioText = useMemo(() => {
    return plainTextFromPortableText(selectedAuthorData?.bio);
  }, [selectedAuthorData]);

  return (
    <div className="mt-8">
        {!resolvedAuthor && featuredPost && (
          <section className="mb-12">
          <div className="grid gap-8 md:grid-cols-[1.15fr_1fr] md:items-stretch lg:grid-cols-[1.2fr_1fr]">
            {featuredPost.mainImage && (
              <Link
                href={`/blog/${featuredPost.slug.current}`}
                className="group block"
              >
                <div className="overflow-hidden rounded-3xl shadow-[0_12px_30px_rgba(0,0,0,0.12)] h-[300px] sm:h-[340px] md:h-full md:min-h-[400px] lg:min-h-[440px] border-0">
                  <img
                    src={featuredPost.mainImage}
                    alt={featuredPost.title}
                    className="block w-full h-full object-cover transition-transform duration-300 scale-[1.02] group-hover:scale-[1.05] border-0"
                  />
                </div>
              </Link>
            )}
            <div className="pt-2">
              {featuredPost.categories?.[0] && (
                <div className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--accent-primary)] -mt-2">
                  {featuredPost.categories[0]}
                </div>
              )}
              <Link
                href={`/blog/${featuredPost.slug.current}`}
                className="mt-3 block text-3xl font-semibold leading-tight text-gray-900 transition hover:underline underline-offset-4 dark:text-gray-100 md:text-4xl"
              >
                {featuredPost.title}
              </Link>
              <p className="mt-4 text-base leading-relaxed text-gray-600 dark:text-gray-400 line-clamp-3 whitespace-pre-line">
                {plainTextExcerpt(featuredPost.body)}
              </p>
              {featuredPost.publishedAt && (
                <div className="mt-6 flex items-center justify-between text-xs tracking-[0.25em] text-gray-500 dark:text-gray-400">
                  <time
                    dateTime={featuredPost.publishedAt}
                    className="uppercase"
                  >
                    {formatBlogDate(featuredPost.publishedAt)}
                  </time>
                  <Link
                    href={`/blog/${featuredPost.slug.current}`}
                    className="text-sm font-medium tracking-normal text-[var(--accent-primary)] transition hover:underline underline-offset-4"
                  >
                    {t('readMore')} <span aria-hidden="true">→</span>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {resolvedAuthor && (
        <div className="mb-10">
          <div className="mb-6 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <button
              type="button"
              onClick={clearAll}
              className="transition hover:text-[var(--accent-primary)] hover:underline underline-offset-4"
            >
              {tNav('blog')}
            </button>
            <span>&gt;</span>
            <span className="text-[var(--accent-primary)]">
              {resolvedAuthor.name}
            </span>
          </div>

          {selectedAuthorData && (
            <div className="flex flex-col gap-6 md:flex-row md:items-start">
                {selectedAuthorData.image && (
                  <div className="relative h-40 w-40 flex-shrink-0 overflow-hidden rounded-xl border border-[0.5px] border-[color-mix(in_srgb,var(--accent-primary)_50%,transparent)]">
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
                  {(selectedAuthorData.jobTitle ||
                    selectedAuthorData.company ||
                    selectedAuthorData.city) && (
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                      {[
                        selectedAuthorData.jobTitle,
                        selectedAuthorData.company,
                        selectedAuthorData.city,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                  {authorBioText && (
                    <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                      {authorBioText}
                    </p>
                  )}
                  {selectedAuthorData.socialMedia?.length ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {selectedAuthorData.socialMedia
                        .filter(item => item?.url)
                        .map((item, index) => (
                          <a
                            key={item._key || `${item.platform}-${index}`}
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 transition hover:text-[var(--accent-primary)] dark:border-gray-700 dark:text-gray-300"
                          >
                            {item.platform || 'link'}
                          </a>
                        ))}
                    </div>
                  ) : null}
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

      <div className="w-full">
        {!resolvedAuthor && allCategories.length > 0 && (
          <div className="mt-5 flex w-full flex-nowrap justify-start gap-1 overflow-x-auto sm:flex-wrap sm:gap-3 sm:overflow-visible">
            <button
              type="button"
              onClick={() => setSelectedCategory(null)}
              className={
                !resolvedCategory
                  ? 'rounded-full border border-transparent px-4 py-2 text-sm font-medium text-[var(--accent-primary)] transition whitespace-nowrap sm:border-[var(--accent-primary)]'
                  : 'rounded-full border border-transparent px-4 py-2 text-sm text-gray-600 hover:text-[var(--accent-primary)] transition whitespace-nowrap dark:text-gray-300 sm:border-gray-300 sm:text-gray-700 sm:dark:border-gray-700 sm:dark:text-gray-200'
              }
            >
              {t('all')}
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
                  resolvedCategory?.norm === category.norm
                    ? 'rounded-full border border-transparent px-4 py-2 text-sm font-medium text-[var(--accent-primary)] transition whitespace-nowrap sm:border-[var(--accent-primary)]'
                    : 'rounded-full border border-transparent px-4 py-2 text-sm text-gray-600 hover:text-[var(--accent-primary)] transition whitespace-nowrap dark:text-gray-300 sm:border-gray-300 sm:text-gray-700 sm:dark:border-gray-700 sm:dark:text-gray-200'
                }
              >
                {getCategoryLabel(category.name)}
              </button>
            ))}
          </div>
        )}

        {selectedCategory && null}
      </div>

      <div className="mt-12">
        <BlogGrid
          posts={filteredPosts}
          onAuthorSelect={toggleAuthor}
          disableHoverColor
        />
      </div>

      {!filteredPosts.length && (
        <p className="text-center text-gray-500 mt-10">{t('noPosts')}</p>
      )}
    </div>
  );
}
