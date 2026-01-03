'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import AuthorModal from './AuthorModal';
import type { Post, PortableTextBlock, PortableTextSpan } from './BlogFilters';

export default function BlogCard({
  post,
  selectedTags,
  onTagToggle,
}: {
  post: Post;
  selectedTags: string[];
  onTagToggle: (tag: string) => void;
}) {
  const t = useTranslations('blog');
  const excerpt =
    (post.body ?? [])
      .filter((b): b is PortableTextBlock => b._type === 'block')
      .map(b =>
        (b.children ?? []).map((c: PortableTextSpan) => c.text ?? '').join(' ')
      )
      .join(' ')
      .slice(0, 160) || '';

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
      "
    >
      {post.mainImage && (
        <div
          className="
            relative w-full aspect-[16/9]
            overflow-hidden
            rounded-sm
            bg-gray-100
            shadow-[0_10px_30px_rgba(0,0,0,0.08)]
            transition-transform duration-300
            group-hover:translate-y-[-2px]
          "
        >
          <Image
            src={post.mainImage}
            alt={post.title}
            fill
            className="object-cover grayscale contrast-125 brightness-105"
            priority={false}
          />
        </div>
      )}

      {/* body */}
      <div className="pt-6 flex flex-col flex-1">
        {/* TITLE */}
        <Link
          href={`/blog/${post.slug.current}`}
          className="
    block
    text-[28px] md:text-[30px]
    font-extrabold
    tracking-tight
    leading-[1.15]
    text-gray-950
    transition
    hover:text-gray-800
    hover:underline
    underline-offset-4
  "
          style={{ fontFamily: 'ui-rounded, system-ui, -apple-system' }}
        >
          {post.title}
        </Link>

        {/* excerpt is the flexible area */}
        {excerpt && (
          <p className="mt-6 text-[16px] leading-7 text-gray-700 max-w-[62ch]">
            {excerpt}
          </p>
        )}

        {/* ✅ sticky bottom block */}
        <div className="mt-auto pt-6">
          {/* AUTHOR (fixed bottom) */}
          {post.author && (
            <div className="mb-4">
              <AuthorModal
                author={post.author}
                publishedAt={post.publishedAt}
              />
            </div>
          )}

          {/* TAGS (fixed bottom) */}
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
                      'text-sm transition underline-offset-4',
                      active
                        ? 'text-gray-950 underline'
                        : 'text-gray-500 hover:text-gray-800 hover:underline',
                    ].join(' ')}
                  >
                    #{norm}
                  </button>
                );
              })}
            </div>
          ) : null}

          {/* resource link (also stays at bottom) */}
          {post.resourceLink && (
            <a
              href={post.resourceLink}
              target="_blank"
              rel="noopener noreferrer"
              className="
                mt-6 inline-flex
                text-sm font-medium
                text-gray-900
                hover:text-gray-700
                underline underline-offset-4
              "
            >
              {t('visitResource')} →
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
