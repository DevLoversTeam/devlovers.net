'use client';

import Image from 'next/image';
import Link from 'next/link';
import AuthorModal from '@/components/blog/AuthorModal';
import type { Post } from '@/components/blog/BlogFilters';
import { normalizeTag } from '@/components/blog/BlogFilters';

function extractExcerpt(body: any[], max = 200) {
  const text =
    body
      ?.filter((b: any) => b?._type === 'block')
      .map((b: any) =>
        (b.children || []).map((c: any) => c.text || '').join(' ')
      )
      .join(' ')
      .trim() || '';

  return text.slice(0, max);
}

export default function BlogCard({
  post,
  selectedTags,
  onTagToggle,
}: {
  post: Post;
  selectedTags: string[];
  onTagToggle: (tag: string) => void;
}) {
  const excerpt = extractExcerpt(post.body || []);

  return (
    <article className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col">
      {post.mainImage && (
        <div className="relative w-full h-56">
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
          className="text-2xl font-semibold text-blue-600 hover:underline"
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
                className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-md"
                title="Category"
              >
                {cat}
              </span>
            ))}
          </div>
        ) : null}

        {post.tags?.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {post.tags.map((tag, i) => {
              const norm = normalizeTag(tag);
              const active = selectedTags.includes(norm);

              return (
                <button
                  key={`${norm}-${i}`}
                  type="button"
                  onClick={() => onTagToggle(norm)}
                  className={[
                    'text-xs rounded-md border px-3 py-1.5 transition',
                    'border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100',
                    active ? 'ring-2 ring-purple-200' : '',
                  ].join(' ')}
                  title="Filter by this tag"
                >
                  #{norm}
                </button>
              );
            })}
          </div>
        ) : null}

        {excerpt ? (
          <p className="mt-4 text-gray-700 flex-grow leading-relaxed">
            {excerpt}
          </p>
        ) : null}

        {post.resourceLink && (
          <a
            href={post.resourceLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block bg-green-600 text-white px-4 py-2 rounded-md text-sm hover:bg-green-700 transition"
          >
            Visit Resource →
          </a>
        )}
      </div>
    </article>
  );
}
