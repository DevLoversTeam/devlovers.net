import groq from 'groq';
import { NextResponse } from 'next/server';

import { client } from '@/client';

const searchQuery = groq`
  *[_type == "post" && defined(slug.current)] | order(publishedAt desc) {
    _id,
    "title": coalesce(title[$locale], title[lower($locale)], title.uk, title.en, title.pl, title),
    "body": coalesce(body[$locale], body[lower($locale)], body.uk, body.en, body.pl, body)[]{
      ...,
      children[]{ text }
    },
    slug
  }
`;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const locale = searchParams.get('locale') || 'en';
  const items = await client
    .withConfig({ useCdn: false })
    .fetch(searchQuery, { locale });
  return NextResponse.json(items || []);
}
