import groq from 'groq';
import { setRequestLocale } from 'next-intl/server';

import { client } from '@/client';

import PostDetails from './PostDetails';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug, locale } = await params;

  const post = await client.fetch(
    groq`*[_type == "post" && slug.current == $slug][0]{
      "title": coalesce(title[$locale], title[lower($locale)], title.uk, title.en, title.pl)
    }`,
    { slug, locale }
  );

  const title = typeof post?.title === 'string' ? post.title : 'Post';
  return { title };
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
