import { eq, sql } from 'drizzle-orm';

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
  // Find author ID by name match in any locale
  const [match] = await db
    .select({ authorId: blogAuthorTranslations.authorId })
    .from(blogAuthorTranslations)
    .where(eq(blogAuthorTranslations.name, name))
    .limit(1);

  if (!match) return null;

  // Fetch full profile for requested locale
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
