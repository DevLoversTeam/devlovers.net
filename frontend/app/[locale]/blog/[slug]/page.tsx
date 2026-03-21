import { setRequestLocale } from 'next-intl/server';

import { getCachedBlogPostBySlug } from '@/db/queries/blog/blog-posts';

import PostDetails from './PostDetails';

export const revalidate = 604800; // 7 days

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug, locale } = await params;
  const post = await getCachedBlogPostBySlug(slug, locale);
  return { title: post?.title ?? 'Post' };
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug, locale } = await params;
  setRequestLocale(locale);
  return <PostDetails slug={slug} locale={locale} />;
}
