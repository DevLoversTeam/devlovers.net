import groq from 'groq';
import { getTranslations } from 'next-intl/server';
import { client } from '@/client';
import BlogFilters from '@/components/blog/BlogFilters';

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

  const posts = await client.fetch(
    groq`
      *[_type == "post" && defined(slug.current)]
        | order(publishedAt desc) {
          _id,
<<<<<<< HEAD
          "title": coalesce(title[$locale], title[lower($locale)], title.uk, title.en, title.pl, title),
=======
          "title": coalesce(title[$locale], title.en, title),
>>>>>>> develop
          slug,
          publishedAt,
          tags,
          resourceLink,

          "categories": categories[]->title,

<<<<<<< HEAD
          "body": coalesce(body[$locale], body[lower($locale)], body.uk, body.en, body.pl, body)[]{
=======
          "body": coalesce(body[$locale], body.en, body)[]{
>>>>>>> develop
            ...,
            children[]{
              text
            }
          },
          "mainImage": mainImage.asset->url,
        "author": author->{
<<<<<<< HEAD
          "name": coalesce(name[$locale], name[lower($locale)], name.uk, name.en, name.pl, name),
          "company": coalesce(company[$locale], company[lower($locale)], company.uk, company.en, company.pl, company),
          "jobTitle": coalesce(jobTitle[$locale], jobTitle[lower($locale)], jobTitle.uk, jobTitle.en, jobTitle.pl, jobTitle),
          "city": coalesce(city[$locale], city[lower($locale)], city.uk, city.en, city.pl, city),
          "bio": coalesce(bio[$locale], bio[lower($locale)], bio.uk, bio.en, bio.pl, bio),
=======
          "name": coalesce(name[$locale], name.en, name),
          "company": coalesce(company[$locale], company.en, company),
          "jobTitle": coalesce(jobTitle[$locale], jobTitle.en, jobTitle),
          "city": coalesce(city[$locale], city.en, city),
          "bio": coalesce(bio[$locale], bio.en, bio),
>>>>>>> develop
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
<<<<<<< HEAD
  const categories = await client.fetch(
    groq`
      *[_type == "category"] | order(orderRank asc) {
        _id,
        title
      }
    `
  );
  const featuredPost = posts?.[0];
=======
>>>>>>> develop

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
