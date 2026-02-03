import groq from 'groq';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { client } from '@/client';
import { BlogCategoryGrid } from '@/components/blog/BlogCategoryGrid';
import { FeaturedPostCtaButton } from '@/components/blog/FeaturedPostCtaButton';
import { DynamicGridBackground } from '@/components/shared/DynamicGridBackground';
import { Link } from '@/i18n/routing';
import { formatBlogDate } from '@/lib/blog/date';

export const revalidate = 0;

type Author = {
  name?: string;
  image?: string;
};

type Post = {
  _id: string;
  title: string;
  slug: { current: string };
  publishedAt?: string;
  categories?: string[];
  mainImage?: string;
  body?: any[];
  author?: Author;
};

type Category = {
  _id: string;
  title: string;
};

const categoriesQuery = groq`
  *[_type == "category"] | order(orderRank asc) {
    _id,
    title
  }
`;

export default async function BlogCategoryPage({
  params,
}: {
  params: Promise<{ locale: string; category: string }>;
}) {
  const { locale, category } = await params;
  const t = await getTranslations({ locale, namespace: 'blog' });
  const tNav = await getTranslations({ locale, namespace: 'navigation' });
  const categoryKey = String(category || '').toLowerCase();
  const categories: Category[] = await client
    .withConfig({ useCdn: false })
    .fetch(categoriesQuery);
  const matchedCategory = categories.find(
    item => slugify(item.title) === categoryKey
  );

  if (!matchedCategory) return notFound();
  const categoryTitle = matchedCategory.title;
  const categoryDisplay = getCategoryLabel(categoryTitle, t);

  const posts: Post[] = await client.withConfig({ useCdn: false }).fetch(
    groq`
      *[_type == "post" && defined(slug.current) && $category in categories[]->title]
        | order(coalesce(publishedAt, _createdAt) desc) {
          _id,
          "title": coalesce(title[$locale], title[lower($locale)], title.uk, title.en, title.pl, title),
          slug,
          publishedAt,
          "categories": categories[]->title,
          "body": coalesce(body[$locale], body[lower($locale)], body.uk, body.en, body.pl, body)[]{
            ...,
            children[]{ text }
          },
          "mainImage": mainImage.asset->url,
          "author": author->{
            "name": coalesce(name[$locale], name[lower($locale)], name.uk, name.en, name.pl, name),
            "image": image.asset->url
          }
        }
    `,
    { locale, category: categoryTitle }
  );

  const featuredPost = posts[0];
  const restPosts = posts.slice(1);
  const featuredDate = formatBlogDate(featuredPost?.publishedAt);

  return (
    <DynamicGridBackground className="bg-gray-50 py-10 transition-colors duration-300 dark:bg-transparent">
      <main className="relative z-10 mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <nav className="mb-6" aria-label="Breadcrumb">
          <ol className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <li className="flex items-center gap-2">
              <Link
                href="/blog"
                className="underline-offset-4 transition hover:text-[var(--accent-primary)] hover:underline"
              >
                {tNav('blog')}
              </Link>
              <span>&gt;</span>
            </li>
            <li className="flex items-center gap-2">
              <span
                className="text-[var(--accent-primary)]"
                aria-current="page"
              >
                {categoryDisplay}
              </span>
            </li>
          </ol>
        </nav>
        <h1 className="mb-4 text-left text-4xl font-bold">{categoryDisplay}</h1>
        {featuredPost?.mainImage && (
          <section className="mt-10">
            <article className="group relative overflow-hidden rounded-3xl bg-white dark:bg-black">
              <div className="h-[320px] max-h-[65vh] w-full overflow-hidden sm:h-[380px] md:h-[450px] lg:h-[618px]">
                <Image
                  src={featuredPost.mainImage}
                  alt={featuredPost.title}
                  width={1400}
                  height={800}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  priority={false}
                />
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-white/95 via-white/70 to-transparent sm:h-64 dark:from-black/90 dark:via-black/60" />
              <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
                {featuredPost.categories?.[0] && (
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {featuredPost.categories[0]}
                  </div>
                )}
                <h2 className="mt-2 text-3xl font-semibold text-gray-900 transition group-hover:text-[var(--accent-primary)] sm:text-4xl dark:text-white dark:group-hover:text-[var(--accent-primary)]">
                  {featuredPost.title}
                </h2>
                <div className="mt-3 flex items-center gap-3 text-sm text-gray-800 dark:text-gray-200">
                  {featuredPost.author?.image && (
                    <Image
                      src={featuredPost.author.image}
                      alt={featuredPost.author.name || 'Author'}
                      width={28}
                      height={28}
                      className="h-7 w-7 rounded-full object-cover"
                    />
                  )}
                  {featuredPost.author?.name && (
                    <span>{featuredPost.author.name}</span>
                  )}
                  {featuredPost.author?.name && featuredDate && <span>·</span>}
                  {featuredDate && featuredPost.publishedAt && (
                    <time dateTime={featuredPost.publishedAt}>
                      {featuredDate}
                    </time>
                  )}
                </div>
              </div>
              <FeaturedPostCtaButton
                href={`/blog/${featuredPost.slug.current}`}
                label={featuredPost.title || 'Read more'}
                className="!absolute !right-6 !bottom-6 z-10 h-11 w-11 rounded-full bg-[var(--accent-primary)] text-white opacity-0 shadow-sm transition group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
              />
            </article>
          </section>
        )}
        <div className="mt-12">
          <BlogCategoryGrid posts={restPosts} />
        </div>
        {!posts.length && (
          <p className="mt-10 text-center text-gray-500">{t('noPosts')}</p>
        )}
      </main>
    </DynamicGridBackground>
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-');
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
