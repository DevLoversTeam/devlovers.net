import PostDetails from './PostDetails';
import { client } from '@/client';
import groq from 'groq';

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
      "title": coalesce(title[$locale], title.en, title),
      "description": pt::text(coalesce(body[$locale], body.en, body))[0...160]
    }`,
    { slug, locale }
  );

  return {
    title: post?.title || 'Post',
    description: post?.description || undefined,
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
