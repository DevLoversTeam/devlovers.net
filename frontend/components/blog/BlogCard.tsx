'use client';

import { useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import type {
  Author,
  Post,
  PortableTextBlock,
  PortableTextSpan,
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
  const locale = useLocale();
  const excerpt =
    (post.body ?? [])
      .filter((b): b is PortableTextBlock => b._type === 'block')
      .map(b =>
        (b.children ?? []).map((c: PortableTextSpan) => c.text ?? '').join(' ')
      )
      .join('\n')
      .slice(0, 160) || '';
  const formattedDate = useMemo(() => {
    if (!post.publishedAt) return '';
    const date = new Date(post.publishedAt);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  }, [post.publishedAt, locale]);
  const categoryLabel =
    post.categories?.[0] === 'Growth' ? 'Career' : post.categories?.[0];

  return (
    <article
      className="
        group
        bg-transparent
        border-0
        shadow-none
        rounded-none
        overflow-visible
        flex flex-col
        h-full
        transition
      "
    >
      {post.mainImage && (
        <Link
          href={`/blog/${post.slug.current}`}
          className="
            relative w-full aspect-[16/9]
            overflow-hidden
            rounded-lg
            bg-gray-100
            shadow-[0_8px_24px_rgba(0,0,0,0.08)]
            dark:border dark:border-[rgba(56,189,248,0.4)] dark:border-[0.5px]
            transition-transform duration-300
          "
        >
          <Image
            src={post.mainImage}
            alt={post.title}
            fill
            className="object-cover brightness-95 contrast-110 scale-[1.03] transition-transform duration-300 group-hover:scale-[1.06]"
            priority={false}
          />
        </Link>
      )}

      <div className="pt-2 px-1 flex flex-col flex-1">
        <Link
          href={`/blog/${post.slug.current}`}
          className={`
            block
            text-[18px] md:text-[22px]
            font-semibold
            tracking-tight
            leading-[1.15]
            text-gray-950 dark:text-gray-100
            transition
            hover:underline
            group-hover:underline
            underline-offset-4
            ${disableHoverColor ? '' : 'dark:group-hover:text-[var(--accent-primary)]'}
          `}
          style={{ fontFamily: 'ui-rounded, system-ui, -apple-system' }}
        >
          {post.title}
        </Link>

        {excerpt && (
          <p className="mt-2 text-[15px] md:text-[16px] leading-[1.55] text-gray-700 dark:text-gray-300 max-w-[60ch] line-clamp-2 whitespace-pre-line">
            {excerpt}
          </p>
        )}

        <div className="mt-auto pt-3">
          {(post.author?.name || formattedDate || categoryLabel) && (
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] md:text-[13px] text-gray-500 dark:text-gray-400">
              {post.author?.name && (
                <button
                  type="button"
                  onClick={() => post.author && onAuthorSelect(post.author)}
                  className="flex items-center gap-2 hover:text-[#ff00ff] hover:underline underline-offset-4 transition"
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
              {formattedDate && <span>{formattedDate}</span>}
            </div>
          )}

          {post.resourceLink && null}
        </div>
      </div>
    </article>
  );
}
