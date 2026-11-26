import { eq, sql } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';

import { STATIC_PAGE_REVALIDATE } from '@/lib/constants/cache';

import { db } from '../../index';
import { blogAuthors, blogAuthorTranslations } from '../../schema/blog';

export interface BlogAuthorProfile {
  name: string;
  image: string | null;
  company: string | null;
  jobTitle: string | null;
  city: string | null;
  bio: string | null;
  socialMedia: unknown[];
}

export async function getBlogAuthorByName(
  name: string,
  locale: string
): Promise<BlogAuthorProfile | null> {
  const [match] = await db
    .select({ authorId: blogAuthorTranslations.authorId })
    .from(blogAuthorTranslations)
    .where(eq(blogAuthorTranslations.name, name))
    .limit(1);

  if (!match) return null;

  const [row] = await db
    .select({
      imageUrl: blogAuthors.imageUrl,
      socialMedia: blogAuthors.socialMedia,
      name: blogAuthorTranslations.name,
      bio: blogAuthorTranslations.bio,
      jobTitle: blogAuthorTranslations.jobTitle,
      company: blogAuthorTranslations.company,
      city: blogAuthorTranslations.city,
    })
    .from(blogAuthors)
    .leftJoin(
      blogAuthorTranslations,
      sql`${blogAuthorTranslations.authorId} = ${blogAuthors.id} AND ${blogAuthorTranslations.locale} = ${locale}`
    )
    .where(eq(blogAuthors.id, match.authorId))
    .limit(1);

  if (!row) return null;

  return {
    name: row.name ?? name,
    image: row.imageUrl,
    company: row.company,
    jobTitle: row.jobTitle,
    city: row.city,
    bio: row.bio,
    socialMedia: (row.socialMedia as unknown[]) ?? [],
  };
}

export const getCachedBlogAuthorByName = unstable_cache(
  async (name: string, locale: string) => getBlogAuthorByName(name, locale),
  ['blog-author-by-name'],
  {
    revalidate: STATIC_PAGE_REVALIDATE,
    tags: ['blog-authors'],
  }
);