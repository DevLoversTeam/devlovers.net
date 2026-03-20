import { and,eq } from 'drizzle-orm';
import { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';

import BlogPostRenderer from '@/components/blog/BlogPostRenderer';
import { db } from '@/db';
import { getAdminBlogPostById } from '@/db/queries/blog/admin-blog';
import {
  blogAuthorTranslations,
  blogCategoryTranslations,
  blogPostCategories,
} from '@/db/schema';
import { Link } from '@/i18n/routing';
import { formatBlogDate } from '@/lib/blog/date';
import { shouldBypassImageOptimization } from '@/lib/blog/image';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Preview Post | DevLovers',
  robots: 'noindex, nofollow',
};

const LOCALES = ['en', 'uk', 'pl'] as const;

export default async function AdminBlogPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const lang = LOCALES.includes(sp.lang as any)
    ? (sp.lang as string)
    : 'en';

  const post = await getAdminBlogPostById(id);
  if (!post) notFound();

  const translation = post.translations[lang];
  const title = translation?.title ?? post.translations.en?.title ?? post.slug;
  const body = translation?.body ?? post.translations.en?.body ?? null;

  // Fetch author name for this locale
  let authorName: string | null = null;
  if (post.authorId) {
    const [authorRow] = await db
      .select({ name: blogAuthorTranslations.name })
      .from(blogAuthorTranslations)
      .where(
        and(
          eq(blogAuthorTranslations.authorId, post.authorId),
          eq(blogAuthorTranslations.locale, lang)
        )
      )
      .limit(1);
    authorName = authorRow?.name ?? null;
  }

  // Fetch category names for this locale
  const categoryRows = await db
    .select({ title: blogCategoryTranslations.title })
    .from(blogPostCategories)
    .innerJoin(
      blogCategoryTranslations,
      and(
        eq(blogCategoryTranslations.categoryId, blogPostCategories.categoryId),
        eq(blogCategoryTranslations.locale, lang)
      )
    )
    .where(eq(blogPostCategories.postId, id));

  const categoryName = categoryRows[0]?.title ?? null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-transparent">
      {/* Preview banner */}
      <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
        Preview Mode — This is how the post will appear on the public site
      </div>

      {/* Admin controls bar */}
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link
          href={`/admin/blog/${id}`}
          className="text-muted-foreground hover:text-foreground text-sm transition-colors"
        >
          &larr; Back to edit
        </Link>

        {/* Locale tabs */}
        <div className="flex gap-1 rounded-md border border-border p-0.5">
          {LOCALES.map(l => (
            <a
              key={l}
              href={`?lang=${l}`}
              className={cn(
                'rounded px-3 py-1 text-xs font-medium transition-colors',
                l === lang
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {l.toUpperCase()}
            </a>
          ))}
        </div>
      </div>

      {/* Post content — matches PostDetails.tsx styling */}
      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-3xl">
          {categoryName && (
            <div className="text-center text-sm font-medium text-[var(--accent-primary)]">
              {categoryName}
            </div>
          )}

          <h1 className="mt-3 text-center text-4xl font-bold text-gray-900 dark:text-gray-100">
            {title}
          </h1>

          {(authorName || post.publishedAt) && (
            <div className="mt-4 flex justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              {authorName && <span>{authorName}</span>}
              {authorName && post.publishedAt && <span>&middot;</span>}
              {post.publishedAt && (
                <time dateTime={new Date(post.publishedAt).toISOString()}>
                  {formatBlogDate(new Date(post.publishedAt).toISOString())}
                </time>
              )}
            </div>
          )}
        </div>

        {post.mainImageUrl && (
          <div className="relative my-8 h-[520px] w-full overflow-hidden rounded-2xl">
            <Image
              src={post.mainImageUrl}
              alt={title}
              fill
              unoptimized={shouldBypassImageOptimization(post.mainImageUrl)}
              className="object-contain"
            />
          </div>
        )}

        <div className="mx-auto w-full max-w-3xl">
          <article className="prose prose-gray max-w-none">
            {body ? (
              <BlogPostRenderer content={body as any} />
            ) : (
              <p className="text-muted-foreground italic">
                No body content for {lang.toUpperCase()} locale
              </p>
            )}
          </article>
        </div>
      </main>
    </div>
  );
}
