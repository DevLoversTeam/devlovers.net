import groq from 'groq';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { client } from '@/client';
import { BlogCategoryGrid } from '@/components/blog/BlogCategoryGrid';

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
  const categoryKey = String(category || '').toLowerCase();
  const categories: Category[] = await client
    .withConfig({ useCdn: false })
    .fetch(categoriesQuery);
  const matchedCategory = categories.find(
    item => slugify(item.title) === categoryKey
  );

  if (!matchedCategory) return notFound();
  const categoryTitle = matchedCategory.title;
  const displayTitle =
    categoryTitle === 'Growth' ? 'Career' : categoryTitle;

  const posts: Post[] = await client.withConfig({ useCdn: false }).fetch(
    groq`
      *[_type == "post" && defined(slug.current) && $category in categories[]->title]
        | order(publishedAt desc) {
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

  return (
    <main className="max-w-6xl mx-auto px-6 py-12">
      <h1 className="text-4xl font-bold mb-4 text-center">
        {displayTitle}
      </h1>
      <div className="mt-12">
        <BlogCategoryGrid posts={posts} />
      </div>
      {!posts.length && (
        <p className="text-center text-gray-500 mt-10">{t('noPosts')}</p>
      )}
    </main>
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-');
}
