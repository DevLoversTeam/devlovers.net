'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { formatBlogDate } from '@/lib/blog/date';

import type {
  Author,
  PortableTextBlock,
  PortableTextSpan,
  Post,
} from './BlogFilters';

export default function BlogCard({
  post,
  onAuthorSelect,
  disableHoverColor = false,
}: {
  post: Post;
  onAuthorSelect: (author: Author) => void;
  disableHoverColor?: boolean;
}) {
  const t = useTranslations('blog');

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

  const excerpt =
    (post.body ?? [])
      .filter((b): b is PortableTextBlock => b._type === 'block')
      .map(b =>
        (b.children ?? []).map((c: PortableTextSpan) => c.text ?? '').join(' ')
      )
      .join('\n')
      .slice(0, 160) || '';
  const formattedDate = useMemo(
    () => formatBlogDate(post.publishedAt),
    [post.publishedAt]
  );
  const rawCategory =
    post.categories?.[0] === 'Growth' ? 'Career' : post.categories?.[0];
  const categoryLabel = rawCategory ? getCategoryLabel(rawCategory) : undefined;

  return (
    <article className="group flex h-full flex-col overflow-visible rounded-none border-0 bg-transparent shadow-none transition">
      {post.mainImage && (
        <Link
          href={`/blog/${post.slug.current}`}
          className="relative aspect-[16/9] w-full overflow-hidden rounded-lg bg-gray-100 shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-transform duration-300 dark:border dark:border-[0.5px] dark:border-[rgba(56,189,248,0.4)]"
        >
          <Image
            src={post.mainImage}
            alt={post.title}
            fill
            className="scale-[1.03] object-cover brightness-95 contrast-110 transition-transform duration-300 group-hover:scale-[1.06]"
            priority={false}
          />
        </Link>
      )}

      <div className="flex flex-1 flex-col px-1 pt-2">
        <Link
          href={`/blog/${post.slug.current}`}
          className={`block text-[18px] leading-[1.15] font-semibold tracking-tight text-gray-950 underline-offset-4 transition group-hover:underline hover:underline md:text-[22px] dark:text-gray-100 ${
            disableHoverColor
              ? ''
              : 'group-hover:text-[var(--accent-primary)] hover:text-[var(--accent-primary)]'
          } `}
          style={{ fontFamily: 'ui-rounded, system-ui, -apple-system' }}
        >
          {post.title}
        </Link>

        {excerpt && (
          <p className="mt-2 line-clamp-2 max-w-[60ch] text-[15px] leading-[1.55] whitespace-pre-line text-gray-700 md:text-[16px] dark:text-gray-300">
            {excerpt}
          </p>
        )}

        <div className="mt-auto pt-3">
          {(post.author?.name || formattedDate || categoryLabel) && (
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-gray-500 md:text-[13px] dark:text-gray-400">
              {post.author?.name && (
                <button
                  type="button"
                  onClick={() => post.author && onAuthorSelect(post.author)}
                  className="flex items-center gap-2 underline-offset-4 transition hover:text-[var(--accent-primary)] hover:underline"
                >
                  {post.author?.image && (
                    <span className="relative h-5 w-5 overflow-hidden rounded-full">
                      <Image
                        src={post.author.image}
                        alt={post.author.name || 'Author'}
                        fill
                        className="object-cover"
                      />
                    </span>
                  )}
                  {post.author.name}
                </button>
              )}
              {post.author?.name && categoryLabel && <span>·</span>}
              {categoryLabel && (
                <span className="rounded-full bg-[color-mix(in_srgb,var(--accent-primary)_20%,transparent)] px-3 py-1 text-[11px] font-medium text-gray-500 dark:bg-[color-mix(in_srgb,var(--accent-primary)_50%,transparent)] dark:text-gray-400">
                  {categoryLabel}
                </span>
              )}
              {(post.author?.name || categoryLabel) && formattedDate && (
                <span>·</span>
              )}
              {formattedDate && post.publishedAt && (
                <time dateTime={post.publishedAt}>{formattedDate}</time>
              )}
            </div>
          )}

          {post.resourceLink && null}
        </div>
      </div>
    </article>
  );
}
