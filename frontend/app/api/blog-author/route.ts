import groq from 'groq';
import { NextResponse } from 'next/server';

import { client } from '@/client';

export const revalidate = 0;

const authorQuery = groq`
  *[_type == "author" && (
    name[$locale] == $name ||
    name[lower($locale)] == $name ||
    name.en == $name ||
    name.pl == $name ||
    name.uk == $name
  )][0]{
    "name": coalesce(name[$locale], name[lower($locale)], name.uk, name.en, name.pl, name),
    "company": coalesce(company[$locale], company[lower($locale)], company.uk, company.en, company.pl, company),
    "jobTitle": coalesce(jobTitle[$locale], jobTitle[lower($locale)], jobTitle.uk, jobTitle.en, jobTitle.pl, jobTitle),
    "city": coalesce(city[$locale], city[lower($locale)], city.uk, city.en, city.pl, city),
    "bio": coalesce(bio[$locale], bio[lower($locale)], bio.uk, bio.en, bio.pl, bio),
    "image": image.asset->url,
    socialMedia[]{ _key, platform, url }
  }
`;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = (searchParams.get('name') || '').trim();
  const locale = (searchParams.get('locale') || 'en').trim();

  if (!name) {
    return NextResponse.json(null, { status: 400 });
  }

  const author = await client
    .withConfig({ useCdn: false })
    .fetch(authorQuery, { name, locale });

  return NextResponse.json(author || null, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
