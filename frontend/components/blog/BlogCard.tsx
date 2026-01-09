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
        transition-transform
        hover:-translate-y-[2px]
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
            transition-transform duration-300
            group-hover:translate-y-[-2px]
          "
        >
          <Image
            src={post.mainImage}
            alt={post.title}
            fill
            className="object-cover grayscale brightness-95 contrast-110 scale-[1.03]"
            priority={false}
          />
        </Link>
      )}

      <div className="pt-8 flex flex-col flex-1">
        <Link
          href={`/blog/${post.slug.current}`}
          className="
    block
    text-[20px] md:text-[22px]
    font-semibold
    tracking-tight
    leading-[1.25]
    text-gray-950
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
          <p className="mt-4 text-[15px] md:text-[16px] leading-[1.7] text-gray-700 max-w-[60ch] line-clamp-3">
            {excerpt}
          </p>
        )}

        <div className="mt-auto pt-6">
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
        </div>
      </div>
    </article>
  );
}
