'use client';

import { useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
<<<<<<< HEAD
import { useLocale, useTranslations } from 'next-intl';
import type {
  Author,
  Post,
  PortableTextBlock,
  PortableTextSpan,
} from './BlogFilters';
=======
import { useTranslations } from 'next-intl';
import AuthorModal from './AuthorModal';
import type { Post, PortableTextBlock, PortableTextSpan } from './BlogFilters';
>>>>>>> develop

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
<<<<<<< HEAD
        transition
=======
        transition-transform
        hover:-translate-y-[2px]
>>>>>>> develop
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
<<<<<<< HEAD
            dark:border dark:border-[rgba(56,189,248,0.25)]
            dark:shadow-[0_0_0_1px_rgba(56,189,248,0.25),0_12px_28px_rgba(56,189,248,0.18)]
            transition-transform duration-300
=======
            transition-transform duration-300
            group-hover:translate-y-[-2px]
>>>>>>> develop
          "
        >
          <Image
            src={post.mainImage}
            alt={post.title}
            fill
<<<<<<< HEAD
            className="object-cover brightness-95 contrast-110 scale-[1.03] transition-transform duration-300 group-hover:scale-[1.06]"
=======
            className="object-cover grayscale brightness-95 contrast-110 scale-[1.03]"
>>>>>>> develop
            priority={false}
          />
        </Link>
      )}

      <div className="pt-8 flex flex-col flex-1">
        <Link
          href={`/blog/${post.slug.current}`}
          className="
    block
<<<<<<< HEAD
    text-[22px] md:text-[26px]
    font-semibold
    tracking-tight
    leading-[1.2]
    text-gray-950 dark:text-gray-100
=======
    text-[20px] md:text-[22px]
    font-semibold
    tracking-tight
    leading-[1.25]
    text-gray-950
>>>>>>> develop
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
<<<<<<< HEAD
          <p className="mt-4 text-[16px] md:text-[17px] leading-[1.65] text-gray-700 dark:text-gray-300 max-w-[60ch] line-clamp-3">
=======
          <p className="mt-4 text-[15px] md:text-[16px] leading-[1.7] text-gray-700 max-w-[60ch] line-clamp-3">
>>>>>>> develop
            {excerpt}
          </p>
        )}

        <div className="mt-auto pt-6">
<<<<<<< HEAD
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
=======
          {post.author && (
            <div className="mb-3">
              <AuthorModal
                author={post.author}
                publishedAt={post.publishedAt}
              />
            </div>
          )}

          {post.tags?.length ? (
            <div className="flex flex-wrap gap-3">
              {post.tags.map((tag, i) => {
                const norm = tag.toLowerCase();
                const active = selectedTags.includes(norm);

                return (
                  <button
                    key={`${norm}-${i}`}
                    onClick={() => onTagToggle(norm)}
                    className={[
                      'text-[13px] text-gray-400 transition underline-offset-4',
                      active
                        ? 'text-gray-950 underline'
                        : 'hover:text-[#ff00ff] hover:underline',
                    ].join(' ')}
                  >
                    #{norm}
                  </button>
                );
              })}
            </div>
          ) : null}

          {post.resourceLink && (
            <a
              href={post.resourceLink}
              target="_blank"
              rel="noopener noreferrer"
              className="
                mt-5 inline-flex
                text-[13px] font-medium
                text-gray-700
                hover:text-[#ff00ff]
                hover:underline
                underline-offset-4
              "
            >
              → {t('readArticle')}
            </a>
          )}
>>>>>>> develop
        </div>
      </div>
    </article>
  );
}
