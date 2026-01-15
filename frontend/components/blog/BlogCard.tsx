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
}: {
  post: Post;
  onAuthorSelect: (author: Author) => void;
}) {
  const t = useTranslations('blog');
  const locale = useLocale();
  const excerpt =
    (post.body ?? [])
      .filter((b): b is PortableTextBlock => b._type === 'block')
      .map(b =>
        (b.children ?? []).map((c: PortableTextSpan) => c.text ?? '').join(' ')
      )
      .join(' ')
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
            dark:border dark:border-[rgba(56,189,248,0.25)]
            dark:shadow-[0_0_0_1px_rgba(56,189,248,0.25),0_12px_28px_rgba(56,189,248,0.18)]
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

      <div className="pt-8 flex flex-col flex-1">
        <Link
          href={`/blog/${post.slug.current}`}
          className="
    block
    text-[22px] md:text-[26px]
    font-semibold
    tracking-tight
    leading-[1.2]
    text-gray-950 dark:text-gray-100
    transition
    hover:text-[#ff00ff]
    hover:underline
    group-hover:text-[#ff00ff]
    group-hover:underline
    underline-offset-4
  "
          style={{ fontFamily: 'ui-rounded, system-ui, -apple-system' }}
        >
          {post.title}
        </Link>

        {excerpt && (
          <p className="mt-4 text-[16px] md:text-[17px] leading-[1.65] text-gray-700 dark:text-gray-300 max-w-[60ch] line-clamp-3">
            {excerpt}
          </p>
        )}

        <div className="mt-auto pt-6">
          {post.author?.name && (
            <div className="mb-3 flex items-center gap-2 text-[13px] md:text-[14px] text-gray-500 dark:text-gray-400">
              <button
                type="button"
                onClick={() => post.author && onAuthorSelect(post.author)}
                className="flex items-center gap-2 hover:text-[#ff00ff] hover:underline underline-offset-4 transition"
              >
                {post.author?.image && (
                  <span className="relative h-6 w-6 overflow-hidden rounded-full">
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
              {formattedDate && <span>·</span>}
              {formattedDate && <span>{formattedDate}</span>}
            </div>
          )}

          {post.resourceLink && null}
        </div>
      </div>
    </article>
  );
}
