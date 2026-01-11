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
          "title": coalesce(title[$locale], title.en, title),
          slug,
          publishedAt,
          tags,
          resourceLink,

          "categories": categories[]->title,

          "body": coalesce(body[$locale], body.en, body)[]{
            ...,
            children[]{
              text
            }
          },
          "mainImage": mainImage.asset->url,
        "author": author->{
          "name": coalesce(name[$locale], name.en, name),
          "company": coalesce(company[$locale], company.en, company),
          "jobTitle": coalesce(jobTitle[$locale], jobTitle.en, jobTitle),
          "city": coalesce(city[$locale], city.en, city),
          "bio": coalesce(bio[$locale], bio.en, bio),
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

  return (
    <main className="max-w-6xl mx-auto px-6 py-12">
      <h1 className="text-4xl font-bold mb-10 text-center">{t('title')}</h1>
      <BlogFilters posts={posts} />
    </main>
  );
}
