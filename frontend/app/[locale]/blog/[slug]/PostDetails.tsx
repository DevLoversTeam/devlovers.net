import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import BlogPostRenderer from '@/components/blog/BlogPostRenderer';
import { DynamicGridBackground } from '@/components/shared/DynamicGridBackground';
import { getBlogPostBySlug, getBlogPosts } from '@/db/queries/blog/blog-posts';
import { Link } from '@/i18n/routing';
import { formatBlogDate } from '@/lib/blog/date';
import { extractPlainText } from '@/lib/blog/text';

function seededShuffle<T>(items: T[], seed: number) {
  const result = [...items];
  let value = seed;
  for (let i = result.length - 1; i > 0; i -= 1) {
    value = (value * 1664525 + 1013904223) % 4294967296;
    const j = value % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function hashString(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function getCategoryLabel(categoryName: string, t: (key: string) => string) {
  const key = categoryName.toLowerCase();
  if (key === 'growth') return t('categories.career');
  if (key === 'tech') return t('categories.tech');
  if (key === 'career') return t('categories.career');
  if (key === 'insights') return t('categories.insights');
  if (key === 'news') return t('categories.news');
  return categoryName;
}

export default async function PostDetails({
  slug,
  locale,
}: {
  slug: string;
  locale: string;
}) {
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'blog' });
  const tNav = await getTranslations({ locale, namespace: 'navigation' });
  const slugParam = String(slug || '').trim();
  if (!slugParam) return notFound();

  const [post, allPosts] = await Promise.all([
    getBlogPostBySlug(slugParam, locale),
    getBlogPosts(locale),
  ]);

  if (!post) return notFound();

  const recommendedPosts = seededShuffle(
    allPosts.filter(p => p.slug !== slugParam),
    hashString(slugParam)
  ).slice(0, 3);

  const authorName = post.author?.name;
  const category = post.categories?.[0];
  const categoryDisplay = category
    ? getCategoryLabel(category.title, t)
    : null;
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const postUrl = baseUrl ? `${baseUrl}/${locale}/blog/${slugParam}` : null;
  const blogUrl = baseUrl ? `${baseUrl}/${locale}/blog` : null;
  const description = extractPlainText(post.body).slice(0, 160);
  const categoryHref = category
    ? `/blog/category/${category.slug}`
    : null;
  const categoryUrl =
    baseUrl && category
      ? `${baseUrl}/${locale}/blog/category/${category.slug}`
      : null;
  const breadcrumbsItems = [
    {
      name: tNav('blog'),
      href: '/blog',
      url: blogUrl,
    },
    ...(category
      ? [
          {
            name: categoryDisplay || category.title,
            href: categoryHref,
            url: categoryUrl,
          },
        ]
      : []),
    {
      name: post.title,
      href: '',
      url: postUrl,
    },
  ];
  const breadcrumbsJsonLd =
    blogUrl && postUrl
      ? {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: breadcrumbsItems
            .filter(item => item.url)
            .map((item, index) => ({
              '@type': 'ListItem',
              position: index + 1,
              name: item.name,
              item: item.url,
            })),
        }
      : null;
  const articleJsonLd = postUrl
    ? {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        description: description || undefined,
        mainEntityOfPage: postUrl,
        url: postUrl,
        datePublished: post.publishedAt || undefined,
        author: post.author?.name
          ? {
              '@type': 'Person',
              name: post.author.name,
            }
          : undefined,
        image: post.mainImage ? [post.mainImage] : undefined,
      }
    : null;

  return (
    <DynamicGridBackground className="bg-gray-50 py-10 transition-colors duration-300 dark:bg-transparent">
      <main className="relative z-10 mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {breadcrumbsJsonLd && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(breadcrumbsJsonLd),
            }}
          />
        )}
        {articleJsonLd && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(articleJsonLd),
            }}
          />
        )}
        <nav className="mb-6" aria-label="Breadcrumb">
          <ol className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            {breadcrumbsItems.map((item, index) => {
              const isLast = index === breadcrumbsItems.length - 1;
              return (
                <li
                  key={`${item.name}-${index}`}
                  className="flex items-center gap-2"
                >
                  {!isLast && item.href ? (
                    <Link
                      href={item.href}
                      className="underline-offset-4 transition hover:text-[var(--accent-primary)] hover:underline"
                    >
                      {item.name}
                    </Link>
                  ) : (
                    <span
                      className="text-[var(--accent-primary)]"
                      aria-current={isLast ? 'page' : undefined}
                    >
                      {item.name}
                    </span>
                  )}
                  {index < breadcrumbsItems.length - 1 && <span>&gt;</span>}
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="mx-auto w-full max-w-3xl">
          {category && (
            <div className="text-center text-sm font-medium text-gray-500 dark:text-gray-400">
              <Link
                href={categoryHref || '/blog'}
                className="inline-flex items-center gap-1 text-[var(--accent-primary)] transition"
              >
                {categoryDisplay || category.title}
              </Link>
            </div>
          )}
          <h1 className="mt-3 text-center text-4xl font-bold text-gray-900 dark:text-gray-100">
            {post.title}
          </h1>

          {(authorName || post.publishedAt) && (
            <div className="mt-4 flex justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              {authorName && (
                <Link
                  href={`/blog?author=${encodeURIComponent(authorName)}`}
                  className="transition hover:text-[var(--accent-primary)]"
                >
                  {authorName}
                </Link>
              )}
              {authorName && post.publishedAt && <span>·</span>}
              {post.publishedAt && (
                <time dateTime={post.publishedAt}>
                  {formatBlogDate(post.publishedAt)}
                </time>
              )}
            </div>
          )}
        </div>

        {post.mainImage && (
          <div className="relative my-8 h-[520px] w-full overflow-hidden rounded-2xl">
            <Image
              src={post.mainImage}
              alt={post.title || 'Post image'}
              fill
              unoptimized
              className="object-contain"
            />
          </div>
        )}

        <div className="mx-auto w-full max-w-3xl">
          <article className="prose prose-gray max-w-none">
            <BlogPostRenderer content={post.body as any} />
          </article>
        </div>

        {recommendedPosts.length > 0 && (
          <>
            <div className="mt-16">
              <div className="h-px w-full bg-gray-200 dark:bg-gray-800" />
            </div>

            <section className="mt-10">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                  {t('recommendedPosts')}
                </h2>
                <div className="mt-6 grid auto-rows-fr gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {recommendedPosts.map(item => {
                    const itemCategory = item.categories?.[0];
                    const itemCategoryDisplay = itemCategory
                      ? getCategoryLabel(itemCategory.title, t)
                      : null;

                    return (
                      <Link
                        key={item.id}
                        href={`/blog/${item.slug}`}
                        className="group flex h-full flex-col"
                      >
                        {item.mainImage && (
                          <div className="relative h-48 w-full overflow-hidden rounded-2xl">
                            <Image
                              src={item.mainImage}
                              alt={item.title || 'Post image'}
                              fill
                              unoptimized
                              className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                            />
                          </div>
                        )}
                        <h3 className="mt-4 text-lg font-semibold text-gray-900 underline-offset-4 transition group-hover:underline dark:text-gray-100">
                          {item.title}
                        </h3>
                        {item.body != null && (
                          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                            {extractPlainText(item.body)}
                          </p>
                        )}
                        {(item.author?.name ||
                          itemCategoryDisplay ||
                          item.publishedAt) && (
                          <div className="mt-auto flex flex-wrap items-center gap-2 pt-3 text-sm text-gray-500 dark:text-gray-400">
                            {item.author?.image && (
                              <span className="relative h-5 w-5 overflow-hidden rounded-full">
                                <Image
                                  src={item.author.image}
                                  alt={item.author.name || 'Author'}
                                  fill
                                  unoptimized
                                  className="object-cover"
                                />
                              </span>
                            )}
                            {item.author?.name && (
                              <span>{item.author.name}</span>
                            )}
                            {item.author?.name && itemCategoryDisplay && (
                              <span>·</span>
                            )}
                            {itemCategoryDisplay && (
                              <span className="rounded-full bg-[color-mix(in_srgb,var(--accent-primary)_20%,transparent)] px-3 py-1 text-[11px] font-medium text-gray-500 dark:bg-[color-mix(in_srgb,var(--accent-primary)_50%,transparent)] dark:text-gray-400">
                                {itemCategoryDisplay}
                              </span>
                            )}
                            {(item.author?.name || itemCategoryDisplay) &&
                              item.publishedAt && <span>·</span>}
                            {item.publishedAt && (
                              <time dateTime={item.publishedAt}>
                                {formatBlogDate(item.publishedAt)}
                              </time>
                            )}
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </DynamicGridBackground>
  );
}
