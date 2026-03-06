import { setRequestLocale } from 'next-intl/server';

import { getBlogPostBySlug } from '@/db/queries/blog/blog-posts';

import PostDetails from './PostDetails';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug, locale } = await params;
  const post = await getBlogPostBySlug(slug, locale);
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
