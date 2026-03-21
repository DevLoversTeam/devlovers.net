import { NextResponse } from 'next/server';

import { getBlogAuthorByName } from '@/db/queries/blog/blog-authors';

export const revalidate = 0;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = (searchParams.get('name') || '').trim();
  const locale = (searchParams.get('locale') || 'en').trim();

  if (!name) {
    return NextResponse.json(null, { status: 400 });
  }

  const author = await getBlogAuthorByName(name, locale);

  return NextResponse.json(author || null, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
