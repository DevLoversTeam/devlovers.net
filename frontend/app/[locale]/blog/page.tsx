import groq from 'groq';
import { getTranslations } from 'next-intl/server';
import { client } from '@/client';
import BlogFilters from '@/components/blog/BlogFilters';

export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'blog' });

  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  };
}

export default async function BlogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'blog' });

  const posts = await client.withConfig({ useCdn: false }).fetch(
    groq`
      *[_type == "post" && defined(slug.current)]
        | order(publishedAt desc) {
          _id,
          "title": coalesce(title[$locale], title[lower($locale)], title.uk, title.en, title.pl, title),
          slug,
          publishedAt,
          tags,
          resourceLink,

          "categories": categories[]->title,

          "body": coalesce(body[$locale], body[lower($locale)], body.uk, body.en, body.pl, body)[]{
            ...,
            children[]{
              text
            }
          },
          "mainImage": mainImage.asset->url,
        "author": author->{
          "name": coalesce(name[$locale], name[lower($locale)], name.uk, name.en, name.pl, name),
          "company": coalesce(company[$locale], company[lower($locale)], company.uk, company.en, company.pl, company),
          "jobTitle": coalesce(jobTitle[$locale], jobTitle[lower($locale)], jobTitle.uk, jobTitle.en, jobTitle.pl, jobTitle),
          "city": coalesce(city[$locale], city[lower($locale)], city.uk, city.en, city.pl, city),
          "bio": coalesce(bio[$locale], bio[lower($locale)], bio.uk, bio.en, bio.pl, bio),
          "image": image.asset->url,
          socialMedia[]{
            _key,
              platform,
              url
            }
          }
        }
    `,
    { locale }
  );
  const categories = await client.withConfig({ useCdn: false }).fetch(
    groq`
      *[_type == "category"] | order(orderRank asc) {
        _id,
        title
      }
    `
  );
  const featuredPost = posts?.[0];

  return (
    <main className="max-w-6xl mx-auto px-6 py-12">
      <h1 className="text-4xl font-bold mb-4 text-center">{t('title')}</h1>
      <p className="mx-auto max-w-2xl text-center text-base text-gray-500 dark:text-gray-400">
        {t('subtitle')}
      </p>
      <BlogFilters
        posts={posts}
        categories={categories}
        featuredPost={featuredPost}
      />
    </main>
  );
}
