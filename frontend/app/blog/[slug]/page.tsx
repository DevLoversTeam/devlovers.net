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
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const post = await client.fetch(
    groq`*[_type == "post" && slug.current == $slug][0]{ title }`,
    { slug }
  );

  return {
    title: post?.title || 'Post',
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PostDetails slug={slug} />;
}
