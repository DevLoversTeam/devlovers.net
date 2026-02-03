'use client';

import {
  Dribbble,
  Facebook,
  Github,
  Globe,
  Instagram,
  Link as LinkIcon,
  Linkedin,
  Send,
  Twitter,
  Youtube,
} from 'lucide-react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import BlogGrid from '@/components/blog/BlogGrid';
import { BlogPagination } from '@/components/blog/BlogPagination';
import { usePathname, useRouter } from '@/i18n/routing';
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

const SOCIAL_ICON_CLASSNAME =
  'h-3.5 w-3.5 text-gray-900 dark:text-gray-100 transition-colors group-hover:text-[var(--accent-primary)] dark:group-hover:text-[var(--accent-primary)]';
const POSTS_PER_PAGE = 9;

function SocialIcon({ platform }: { platform?: string }) {
  const normalized = (platform || '').trim().toLowerCase();
  if (normalized === 'github') {
    return <Github className={SOCIAL_ICON_CLASSNAME} strokeWidth={1.8} />;
  }
  if (normalized === 'linkedin') {
    return <Linkedin className={SOCIAL_ICON_CLASSNAME} strokeWidth={1.8} />;
  }
  if (normalized === 'youtube') {
    return <Youtube className={SOCIAL_ICON_CLASSNAME} strokeWidth={1.8} />;
  }
  if (normalized === 'facebook') {
    return <Facebook className={SOCIAL_ICON_CLASSNAME} strokeWidth={1.8} />;
  }
  if (normalized === 'x' || normalized === 'twitter') {
    return <Twitter className={SOCIAL_ICON_CLASSNAME} strokeWidth={1.8} />;
  }
  if (normalized === 'dribbble') {
    return <Dribbble className={SOCIAL_ICON_CLASSNAME} strokeWidth={1.8} />;
  }
  if (normalized === 'instagram') {
    return <Instagram className={SOCIAL_ICON_CLASSNAME} strokeWidth={1.8} />;
  }
  if (normalized === 'telegram') {
    return <Send className={SOCIAL_ICON_CLASSNAME} strokeWidth={1.8} />;
  }
  if (normalized === 'website' || normalized === 'portfolio') {
    return <Globe className={SOCIAL_ICON_CLASSNAME} strokeWidth={1.8} />;
  }
  if (normalized === 'behance') {
    return (
      <span
        aria-hidden="true"
        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current text-[8px] font-semibold text-gray-900 transition-colors group-hover:text-[var(--accent-primary)] dark:text-gray-100 dark:group-hover:text-[var(--accent-primary)]"
      >
        B
      </span>
    );
  }
  return <LinkIcon className={SOCIAL_ICON_CLASSNAME} strokeWidth={1.8} />;
}

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
  const authorHeadingRef = useRef<HTMLHeadingElement>(null);
  const [selectedCategory, setSelectedCategory] = useState<{
    name: string;
    norm: string;
  } | null>(null);
  const lastFiltersRef = useRef<{
    author: string;
    category: string;
    query: string;
  } | null>(null);
  const pendingScrollRef = useRef(false);
  const categoryFiltersRef = useRef<HTMLDivElement>(null);
  const postsGridRef = useRef<HTMLDivElement>(null);

  const toggleAuthor = (author: Author) => {
    const name = author.name || '';
    const norm = normalizeAuthor(name);
    if (!norm) return;
    const isSame = selectedAuthor?.norm === norm;
    setSelectedAuthor(isSame ? null : { name, norm, data: author });
    const params = new URLSearchParams(searchParams?.toString() || '');
    if (isSame) {
      params.delete('author');
    } else {
      params.set('author', name);
    }
    const nextPath = params.toString() ? `${pathname}?${params}` : pathname;
    router.replace(nextPath);
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
    const key = categoryName.toLowerCase() as
      | 'tech'
      | 'career'
      | 'insights'
      | 'news'
      | 'growth';
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
  const searchQueryNormalized = normalizeSearchText(searchQuery);
  const didClearSearchRef = useRef(false);
  const parsedPage = useMemo(() => {
    const raw = searchParams?.get('page') || '';
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) && value > 0 ? value : 1;
  }, [searchParams]);

  const updatePageParam = useCallback(
    (page: number) => {
      const params = new URLSearchParams(searchParams?.toString() || '');
      if (page <= 1) {
        params.delete('page');
      } else {
        params.set('page', String(page));
      }
      const nextPath = params.toString() ? `${pathname}?${params}` : pathname;
      router.replace(nextPath, { scroll: false });
    },
    [pathname, router, searchParams]
  );

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
    const nextFilters = {
      author: resolvedAuthor?.norm || '',
      category: resolvedCategory?.norm || '',
      query: searchQueryNormalized,
    };
    const prevFilters = lastFiltersRef.current;
    if (!prevFilters) {
      lastFiltersRef.current = nextFilters;
      return;
    }
    const hasChanged =
      prevFilters.author !== nextFilters.author ||
      prevFilters.category !== nextFilters.category ||
      prevFilters.query !== nextFilters.query;
    if (!hasChanged) return;
    lastFiltersRef.current = nextFilters;
    if (parsedPage !== 1) {
      updatePageParam(1);
    }
  }, [
    parsedPage,
    resolvedAuthor?.norm,
    resolvedCategory?.norm,
    searchQueryNormalized,
    updatePageParam,
  ]);

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

  useEffect(() => {
    if (!resolvedAuthor?.norm) return;
    const frame = window.requestAnimationFrame(() => {
      authorHeadingRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [resolvedAuthor?.norm]);

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

      if (searchQueryNormalized) {
        const titleText = normalizeSearchText(post.title);
        const bodyText = normalizeSearchText(
          plainTextFromPortableText(post.body)
        );
        const words = searchQueryNormalized.split(/\s+/).filter(Boolean);
        if (
          !words.some(
            word => titleText.includes(word) || bodyText.includes(word)
          )
        ) {
          return false;
        }
      }

      return true;
    });
  }, [posts, resolvedAuthor, resolvedCategory, searchQueryNormalized]);
  const totalPages = Math.max(
    1,
    Math.ceil(filteredPosts.length / POSTS_PER_PAGE)
  );
  const currentPage = Math.min(parsedPage, totalPages);
  const paginatedPosts = useMemo(() => {
    const start = (currentPage - 1) * POSTS_PER_PAGE;
    return filteredPosts.slice(start, start + POSTS_PER_PAGE);
  }, [currentPage, filteredPosts]);

  const selectedAuthorData = useMemo(() => {
    const resolvedName = resolvedAuthor?.name;
    if (!resolvedName) return null;
    if (authorProfile?.name === resolvedName) return authorProfile.data;
    return resolvedAuthor?.data || null;
  }, [authorProfile, resolvedAuthor?.data, resolvedAuthor?.name]);
  const authorBioText = useMemo(() => {
    return plainTextFromPortableText(selectedAuthorData?.bio);
  }, [selectedAuthorData]);

  useEffect(() => {
    if (parsedPage <= totalPages) return;
    updatePageParam(totalPages);
  }, [parsedPage, totalPages, updatePageParam]);

  const scrollToCategoryFilters = useCallback(() => {
    const target = categoryFiltersRef.current || postsGridRef.current;
    target?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, []);

  useEffect(() => {
    if (!pendingScrollRef.current) return;
    pendingScrollRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      scrollToCategoryFilters();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentPage, scrollToCategoryFilters]);

  return (
    <div className="mt-4">
      {!resolvedAuthor && featuredPost && (
        <section className="mb-12">
          <div className="grid gap-8 md:grid-cols-[1.3fr_1fr] md:items-stretch lg:grid-cols-[1.4fr_1fr]">
            {featuredPost.mainImage && (
              <Link
                href={`/blog/${featuredPost.slug.current}`}
                className="group block"
              >
                <div className="relative h-[300px] overflow-hidden rounded-3xl border-0 shadow-[0_12px_30px_rgba(0,0,0,0.12)] sm:h-[340px] md:h-full md:min-h-[400px] lg:min-h-[440px]">
                  <Image
                    src={featuredPost.mainImage}
                    alt={featuredPost.title}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 60vw, 720px"
                    className="scale-[1.02] object-cover transition-transform duration-300 group-hover:scale-[1.05]"
                    priority
                  />
                </div>
              </Link>
            )}
            <div className="relative flex h-full flex-col pt-8">
              {featuredPost.categories?.[0] && (
                <div className="absolute top-0 left-0 text-xs font-bold tracking-[0.2em] text-[var(--accent-primary)] uppercase">
                  {getCategoryLabel(
                    featuredPost.categories[0] === 'Growth'
                      ? 'Career'
                      : featuredPost.categories[0]
                  )}
                </div>
              )}
              <div className="my-auto">
                <Link
                  href={`/blog/${featuredPost.slug.current}`}
                  className="mt-3 block text-3xl leading-tight font-semibold text-gray-900 underline-offset-4 transition hover:underline md:text-4xl dark:text-gray-100"
                >
                  {featuredPost.title}
                </Link>
                <p className="mt-4 line-clamp-3 text-base leading-relaxed whitespace-pre-line text-gray-600 dark:text-gray-400">
                  {plainTextExcerpt(featuredPost.body)}
                </p>
              </div>
              {featuredPost.publishedAt && (
                <div className="mt-auto flex items-center justify-between pt-8 text-xs tracking-[0.25em] text-gray-500 dark:text-gray-400">
                  <time
                    dateTime={featuredPost.publishedAt}
                    className="uppercase"
                  >
                    {formatBlogDate(featuredPost.publishedAt)}
                  </time>
                  <Link
                    href={`/blog/${featuredPost.slug.current}`}
                    className="text-sm font-medium tracking-normal text-[var(--accent-primary)] underline-offset-4 transition hover:underline"
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
              className="underline-offset-4 transition hover:text-[var(--accent-primary)] hover:underline"
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
                  <h2
                    ref={authorHeadingRef}
                    className="scroll-mt-24 text-2xl font-semibold text-gray-900 dark:text-gray-100"
                  >
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
                  <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-gray-600 dark:text-gray-400">
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
                          className="group inline-flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 transition hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] dark:border-gray-700 dark:text-gray-300 dark:hover:border-[var(--accent-primary)] dark:hover:text-[var(--accent-primary)]"
                        >
                          <SocialIcon platform={item.platform} />
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
          <div
            ref={categoryFiltersRef}
            className="mt-5 flex w-full flex-nowrap justify-start gap-1 overflow-x-auto sm:flex-wrap sm:gap-3 sm:overflow-visible"
          >
            <button
              type="button"
              onClick={() => setSelectedCategory(null)}
              className={
                !resolvedCategory
                  ? 'rounded-full border border-transparent px-4 py-2 text-sm font-medium whitespace-nowrap text-[var(--accent-primary)] transition sm:border-[var(--accent-primary)]'
                  : 'hover:bg-secondary hover:text-foreground rounded-full border border-transparent px-4 py-2 text-sm whitespace-nowrap text-gray-600 transition sm:border-gray-300 sm:text-gray-700 dark:text-gray-300 sm:dark:border-gray-700 sm:dark:text-gray-200'
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
                    ? 'rounded-full border border-transparent px-4 py-2 text-sm font-medium whitespace-nowrap text-[var(--accent-primary)] transition sm:border-[var(--accent-primary)]'
                    : 'hover:bg-secondary hover:text-foreground rounded-full border border-transparent px-4 py-2 text-sm whitespace-nowrap text-gray-600 transition sm:border-gray-300 sm:text-gray-700 dark:text-gray-300 sm:dark:border-gray-700 sm:dark:text-gray-200'
                }
              >
                {getCategoryLabel(category.name)}
              </button>
            ))}
          </div>
        )}

        {selectedCategory && null}
      </div>

      <div className="mt-12" ref={postsGridRef}>
        <BlogGrid
          posts={paginatedPosts}
          onAuthorSelect={toggleAuthor}
          disableHoverColor
        />
        <BlogPagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={page => {
            pendingScrollRef.current = true;
            updatePageParam(page);
          }}
          accentColor="var(--accent-primary)"
        />
      </div>
    </div>
  );
}
