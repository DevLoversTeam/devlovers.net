import groq from 'groq';

import { client } from '@/client';

import PostDetails from './PostDetails';

export const revalidate = 3600;

export async function generateStaticParams() {
  const slugs = await client.fetch<string[]>(
    groq`*[_type == "post" && defined(slug.current)][].slug.current`
  );

  return slugs.map(slug => ({
    slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug, locale } = await params;

  const post = await client.fetch(
    groq`*[_type == "post" && slug.current == $slug][0]{
      "title": string(coalesce(title[$locale], title[lower($locale)], title.uk, title.en, title.pl, title))
    }`,
    { slug, locale }
  );

  return {
    title: post?.title || 'Post',
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug, locale } = await params;
  return <PostDetails slug={slug} locale={locale} />;
}
