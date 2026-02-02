import groq from 'groq';
import { unstable_noStore as noStore } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { client } from '@/client';
import BlogFilters from '@/components/blog/BlogFilters';
import { BlogPageHeader } from '@/components/blog/BlogPageHeader';
import { DynamicGridBackground } from '@/components/shared/DynamicGridBackground';

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
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  noStore();
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'blog' });
  const sp = searchParams ? await searchParams : undefined;
  const authorParam =
    typeof sp?.author === 'string' ? sp.author.trim() : '';
  const hasAuthorFilter = authorParam.length > 0;

  const posts = await client.withConfig({ useCdn: false }).fetch(
    groq`
      *[_type == "post" && defined(slug.current)]
        | order(coalesce(publishedAt, _createdAt) desc) {
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
    <DynamicGridBackground className="bg-gray-50 transition-colors duration-300 dark:bg-transparent py-10">
      <main className="relative z-10 mx-auto max-w-7xl pt-6 pb-12">
        {!hasAuthorFilter && (
          <BlogPageHeader title={t('title')} subtitle={t('subtitle')} />
        )}
        <BlogFilters
          posts={posts}
          categories={categories}
          featuredPost={featuredPost}
        />
      </main>
    </DynamicGridBackground>
  );
}
