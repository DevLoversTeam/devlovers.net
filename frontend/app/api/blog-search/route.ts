import { NextResponse } from 'next/server';

import { getBlogPosts } from '@/db/queries/blog/blog-posts';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const locale = searchParams.get('locale') || 'en';
  const posts = await getBlogPosts(locale);

  const items = posts.map(p => ({
    id: p.id,
    title: p.title,
    body: p.body,
    slug: p.slug,
  }));

  return NextResponse.json(items);
}
