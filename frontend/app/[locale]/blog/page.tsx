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

  const posts = await client.fetch(groq`
    *[_type == "post" && defined(slug.current)]
      | order(publishedAt desc) {
        _id,
        title,
        slug,
        publishedAt,
        tags,
        resourceLink,

        "categories": categories[]->title,

        body[] {
          ...,
          children[]{
            text
          }
        },
        "mainImage": mainImage.asset->url,
        "author": author->{
          name,
          company,
          jobTitle,
          city,
          bio,
          "image": image.asset->url,
          socialMedia[]{
            _key,
            platform,
            url
          }
        }
      }
  `);

  return (
    <main className="max-w-6xl mx-auto px-6 py-12">
      <h1 className="text-4xl font-bold mb-10 text-center">{t('title')}</h1>
      <BlogFilters posts={posts} />
    </main>
  );
}
