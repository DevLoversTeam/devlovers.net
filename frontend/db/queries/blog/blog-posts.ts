import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';

import type { SocialLink } from '@/components/blog/BlogFilters';

import { db } from '../../index';
import {
  blogAuthors,
  blogAuthorTranslations,
  blogCategories,
  blogCategoryTranslations,
  blogPostCategories,
  blogPosts,
  blogPostTranslations,
} from '../../schema/blog';


const publishedFilter = and(
  eq(blogPosts.isPublished, true),
  or(
    isNull(blogPosts.scheduledPublishAt),
    sql`${blogPosts.scheduledPublishAt} <= NOW()`
  )
);

export interface BlogPost {
  id: string;          
  title: string;         
  slug: string;          
  publishedAt: string;   
  tags: string[];        
  categories: { slug: string; title: string }[]; 
  body: unknown;         
  resourceLink?: string;
  mainImage?: string;
  author?: { 
    name: string;
    image?: string;
    company?: string;
    jobTitle?: string;
    city?: string;
    bio?: string | null; // matches BlogFilters
    socialMedia?: SocialLink[];
  };
}

interface RawPostRow {
  id: string;
  slug: string;
  publishedAt: Date | null;
  mainImageUrl: string | null;
  tags: string[];
  resourceLink: string | null;
  title: string | null;
  body: unknown;
  authorId: string | null;
  authorImageUrl: string | null;
  authorSocialMedia: unknown;
  authorName: string | null;
  authorCompany: string | null;
  authorJobTitle: string | null;
  authorCity: string | null;
  authorBio: string | null;
}

function buildPostSelect() {
  return {
    id: blogPosts.id,
    slug: blogPosts.slug,
    publishedAt: blogPosts.publishedAt,
    mainImageUrl: blogPosts.mainImageUrl,
    tags: blogPosts.tags,
    resourceLink: blogPosts.resourceLink,
    title: blogPostTranslations.title,
    body: blogPostTranslations.body,
    authorId: blogPosts.authorId,
    authorImageUrl: blogAuthors.imageUrl,
    authorSocialMedia: blogAuthors.socialMedia,
    authorName: blogAuthorTranslations.name,
    authorCompany: blogAuthorTranslations.company,
    authorJobTitle: blogAuthorTranslations.jobTitle,
    authorCity: blogAuthorTranslations.city,
    authorBio: blogAuthorTranslations.bio,
  };
}

function buildPostJoins(locale: string) {
  return (qb: any) =>
    qb
      .leftJoin(
        blogPostTranslations,
        sql`${blogPostTranslations.postId} = ${blogPosts.id} AND ${blogPostTranslations.locale} = ${locale}`
      )
      .leftJoin(blogAuthors, eq(blogAuthors.id, blogPosts.authorId))
      .leftJoin(
        blogAuthorTranslations,
        sql`${blogAuthorTranslations.authorId} = ${blogAuthors.id} AND ${blogAuthorTranslations.locale} = ${locale}`
      );
}

async function attachCategories(
  postIds: string[],
  locale: string
): Promise<Map<string, { slug: string; title: string }[]>> {
  if (postIds.length === 0) return new Map();

  const catRows = await db
    .select({
      postId: blogPostCategories.postId,
      slug: blogCategories.slug,
      title: blogCategoryTranslations.title,
    })
    .from(blogPostCategories)
    .innerJoin(
      blogCategories,
      eq(blogCategories.id, blogPostCategories.categoryId)
    )
    .innerJoin(
      blogCategoryTranslations,
      sql`${blogCategoryTranslations.categoryId} = ${blogCategories.id} AND ${blogCategoryTranslations.locale} = ${locale}`
    )
    .where(inArray(blogPostCategories.postId, postIds));

  const map = new Map<string, { slug: string; title: string }[]>();
  for (const row of catRows) {
    const arr = map.get(row.postId) ?? [];
    arr.push({ slug: row.slug, title: row.title });
    map.set(row.postId, arr);
  }
  return map;
}

function assemblePost(
  row: RawPostRow,
  categories: { slug: string; title: string }[]
): BlogPost  {
  return {
    id: row.id,
    title: row.title ?? '',
    slug: row.slug,
    publishedAt: row.publishedAt?.toISOString() ?? '',
    tags: row.tags ?? [],
    categories,
    resourceLink: row.resourceLink ?? undefined,
    mainImage: row.mainImageUrl ?? undefined,
    body: row.body,
    author: row.authorName
      ? {
          name: row.authorName,
          image: row.authorImageUrl ?? undefined,
          company: row.authorCompany ?? undefined,
          jobTitle: row.authorJobTitle ?? undefined,
          city: row.authorCity ?? undefined,
          bio: row.authorBio ?? null,
          socialMedia: (row.authorSocialMedia as SocialLink[]) ?? [],
        }
      : undefined,
  };
}

// ── Public queries ──

export async function getBlogPosts(
  locale: string
): Promise<BlogPost[]> {
  const rows = await db
    .select(buildPostSelect())
    .from(blogPosts)
    .leftJoin(
      blogPostTranslations,
      sql`${blogPostTranslations.postId} = ${blogPosts.id} AND ${blogPostTranslations.locale} = ${locale}`
    )
    .leftJoin(blogAuthors, eq(blogAuthors.id, blogPosts.authorId))
    .leftJoin(
      blogAuthorTranslations,
      sql`${blogAuthorTranslations.authorId} = ${blogAuthors.id} AND ${blogAuthorTranslations.locale} = ${locale}`
    )
    .where(publishedFilter)
    .orderBy(sql`${blogPosts.publishedAt} DESC NULLS LAST`);

  const postIds = rows.map(r => r.id);
  const catMap = await attachCategories(postIds, locale);

  return rows.map(row =>
    assemblePost(row as RawPostRow, catMap.get(row.id) ?? [])
  );
}

export async function getBlogPostBySlug(
  slug: string,
  locale: string
): Promise<BlogPost | null> {
  const [row] = await db
    .select(buildPostSelect())
    .from(blogPosts)
    .leftJoin(
      blogPostTranslations,
      sql`${blogPostTranslations.postId} = ${blogPosts.id} AND ${blogPostTranslations.locale} = ${locale}`
    )
    .leftJoin(blogAuthors, eq(blogAuthors.id, blogPosts.authorId))
    .leftJoin(
      blogAuthorTranslations,
      sql`${blogAuthorTranslations.authorId} = ${blogAuthors.id} AND ${blogAuthorTranslations.locale} = ${locale}`
    )
    .where(and(eq(blogPosts.slug, slug), publishedFilter))
    .limit(1);

  if (!row) return null;

  const catMap = await attachCategories([row.id], locale);
  const base = assemblePost(row as RawPostRow, catMap.get(row.id) ?? []);

  return {
    ...base,
    author: base.author
      ? { ...base.author, bio: (row as RawPostRow).authorBio }
      : undefined,
  };
}

export async function getBlogPostsByCategory(
  categorySlug: string,
  locale: string
): Promise<BlogPost[]> {
  // Step 1: find category ID by slug
  const [cat] = await db
    .select({ id: blogCategories.id })
    .from(blogCategories)
    .where(eq(blogCategories.slug, categorySlug))
    .limit(1);

  if (!cat) return [];

  // Step 2: get post IDs in this category
  const junctionRows = await db
    .select({ postId: blogPostCategories.postId })
    .from(blogPostCategories)
    .where(eq(blogPostCategories.categoryId, cat.id));

  const postIds = junctionRows.map(r => r.postId);
  if (postIds.length === 0) return [];

  // Step 3: fetch posts with the standard joins
  const rows = await db
    .select(buildPostSelect())
    .from(blogPosts)
    .leftJoin(
      blogPostTranslations,
      sql`${blogPostTranslations.postId} = ${blogPosts.id} AND ${blogPostTranslations.locale} = ${locale}`
    )
    .leftJoin(blogAuthors, eq(blogAuthors.id, blogPosts.authorId))
    .leftJoin(
      blogAuthorTranslations,
      sql`${blogAuthorTranslations.authorId} = ${blogAuthors.id} AND ${blogAuthorTranslations.locale} = ${locale}`
    )
    .where(and(inArray(blogPosts.id, postIds), publishedFilter))
    .orderBy(sql`${blogPosts.publishedAt} DESC NULLS LAST`);

  const catMap = await attachCategories(
    rows.map(r => r.id),
    locale
  );

  return rows.map(row =>
    assemblePost(row as RawPostRow, catMap.get(row.id) ?? [])
  );
}

export async function getBlogPostSlugs(): Promise<{ slug: string }[]> {
  return db
    .select({ slug: blogPosts.slug })
    .from(blogPosts)
    .where(publishedFilter);
}
