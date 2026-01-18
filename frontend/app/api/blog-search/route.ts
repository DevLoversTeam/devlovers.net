import groq from 'groq';
import { NextResponse } from 'next/server';
import { client } from '@/client';

const searchQuery = groq`
  *[_type == "post" && defined(slug.current)] | order(publishedAt desc) {
    _id,
    "title": coalesce(title.en, title.uk, title.pl, title),
    "body": coalesce(body.en, body.uk, body.pl, body)[]{
      ...,
      children[]{ text }
    },
    slug
  }
`;

export async function GET() {
  const items = await client.withConfig({ useCdn: false }).fetch(searchQuery);
  return NextResponse.json(items || []);
}
