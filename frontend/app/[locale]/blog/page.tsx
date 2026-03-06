import { getTranslations } from 'next-intl/server';

import BlogFilters from '@/components/blog/BlogFilters';
import { BlogPageHeader } from '@/components/blog/BlogPageHeader';
import { DynamicGridBackground } from '@/components/shared/DynamicGridBackground';
import { getBlogCategories } from '@/db/queries/blog/blog-categories';
import { getBlogPosts } from '@/db/queries/blog/blog-posts';

export const revalidate = 3600;

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

  const [posts, categories] = await Promise.all([
    getBlogPosts(locale),
    getBlogCategories(locale),
  ]);

  const featuredPost = posts[0];

  return (
    <DynamicGridBackground className="bg-gray-50 py-10 transition-colors duration-300 dark:bg-transparent">
      <main className="relative z-10 mx-auto max-w-7xl px-4 pt-6 pb-12 sm:px-6 lg:px-8">
        <BlogPageHeader title={t('title')} subtitle={t('subtitle')} />
        <BlogFilters
          posts={posts}
          categories={categories}
          featuredPost={featuredPost}
        />
      </main>
    </DynamicGridBackground>
  );
}
