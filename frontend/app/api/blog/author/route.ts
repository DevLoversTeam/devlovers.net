import { NextResponse } from 'next/server';

import { getCachedBlogAuthorByName } from '@/db/queries/blog/blog-authors';

export const revalidate = 604800; // 7 days

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = (searchParams.get('name') || '').trim();
  const locale = (searchParams.get('locale') || 'en').trim();

  if (!name) {
    return NextResponse.json(null, { status: 400 });
  }

  const author = await getCachedBlogAuthorByName(name, locale);

  return NextResponse.json(author || null);
}