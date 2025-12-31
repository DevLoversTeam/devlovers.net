'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import AuthorModal from './AuthorModal';
import type { Post, PortableTextBlock } from './BlogFilters';

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
    post.body
      ?.filter((b): b is PortableTextBlock => b?._type === 'block')
      .map(b => (b.children || []).map(c => c.text || '').join(' '))
      .join(' ')
      .slice(0, 160) || '';

  return (
    <article
      className="
        bg-white
        border border-gray-200
        rounded-xl
        overflow-hidden
        shadow-[0_1px_0_rgba(0,0,0,0.04)]
        hover:shadow-[0_10px_30px_rgba(0,0,0,0.08)]
        transition-shadow
        flex flex-col
      "
    >
      {post.mainImage && (
        <div className="relative w-full aspect-[16/9] bg-gray-100">
          <Image
            src={post.mainImage}
            alt={post.title}
            fill
            className="object-cover"
          />
        </div>
      )}

      <div className="p-6 flex flex-col flex-grow">
        <Link
          href={`/blog/${post.slug.current}`}
          className="
            text-[22px]
            font-semibold
            text-gray-900
            leading-snug
            hover:text-gray-700
            transition
          "
          style={{ fontFamily: 'ui-rounded, system-ui, -apple-system' }}
        >
          {post.title}
        </Link>

        {post.author && (
          <AuthorModal author={post.author} publishedAt={post.publishedAt} />
        )}

        {post.categories?.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {post.categories.map((cat, i) => (
              <span
                key={`${cat}-${i}`}
                className="
                  text-xs
                  bg-gray-100
                  text-gray-700
                  border border-gray-300
                  px-3 py-1.5
                  rounded-md
                "
              >
                {cat}
              </span>
            ))}
          </div>
        ) : null}

        {post.tags?.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {post.tags.map((tag, i) => {
              const norm = tag.toLowerCase();
              const active = selectedTags.includes(norm);

              return (
                <button
                  key={`${norm}-${i}`}
                  type="button"
                  onClick={() => onTagToggle(norm)}
                  className={[
                    'text-xs px-3 py-1.5 rounded-md border transition',
                    active
                      ? 'bg-gray-200 border-gray-400 text-gray-800'
                      : 'bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100',
                  ].join(' ')}
                >
                  #{norm}
                </button>
              );
            })}
          </div>
        ) : null}

        {excerpt && (
          <p className="mt-4 text-gray-600 leading-relaxed flex-grow">
            {excerpt}
          </p>
        )}

        {post.resourceLink && (
          <a
            href={post.resourceLink}
            target="_blank"
            rel="noopener noreferrer"
            className="
              mt-6
              inline-flex items-center justify-center
              w-full
              border border-gray-300
              bg-white
              text-gray-800
              px-4 py-2.5
              rounded-lg
              text-sm font-medium
              hover:bg-gray-50 hover:border-gray-400
              transition
            "
          >
            {t('visitResource')}
          </a>
        )}
      </div>
    </article>
  );
}
