import { eq, sql } from 'drizzle-orm';

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

const ADMIN_LOCALE = 'en';

// ── List ────────────────────────────────────────────────────────

export interface AdminBlogListItem {
  id: string;
  slug: string;
  title: string;
  authorName: string | null;
  isPublished: boolean;
  publishedAt: Date | null;
  scheduledPublishAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function getAdminBlogList(): Promise<AdminBlogListItem[]> {
  const rows = await db
    .select({
      id: blogPosts.id,
      slug: blogPosts.slug,
      title: blogPostTranslations.title,
      authorName: blogAuthorTranslations.name,
      isPublished: blogPosts.isPublished,
      publishedAt: blogPosts.publishedAt,
      scheduledPublishAt: blogPosts.scheduledPublishAt,
      createdAt: blogPosts.createdAt,
      updatedAt: blogPosts.updatedAt,
    })
    .from(blogPosts)
    .leftJoin(
      blogPostTranslations,
      sql`${blogPostTranslations.postId} = ${blogPosts.id} AND ${blogPostTranslations.locale} = ${ADMIN_LOCALE}`
    )
    .leftJoin(blogAuthors, eq(blogAuthors.id, blogPosts.authorId))
    .leftJoin(
      blogAuthorTranslations,
      sql`${blogAuthorTranslations.authorId} = ${blogAuthors.id} AND ${blogAuthorTranslations.locale} = ${ADMIN_LOCALE}`
    )
    .orderBy(
      sql`${blogPosts.isPublished} ASC`,
      sql`${blogPosts.updatedAt} DESC`
    );

  return rows.map(row => ({
    id: row.id,
    slug: row.slug,
    title: row.title ?? '(untitled)',
    authorName: row.authorName,
    isPublished: row.isPublished,
    publishedAt: row.publishedAt,
    scheduledPublishAt: row.scheduledPublishAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

// ── Detail (for editing) ────────────────────────────────────────

export interface AdminBlogTranslation {
  title: string;
  body: unknown;
}

export interface AdminBlogPostFull {
  id: string;
  slug: string;
  authorId: string | null;
  mainImageUrl: string | null;
  mainImagePublicId: string | null;
  tags: string[];
  resourceLink: string | null;
  isPublished: boolean;
  publishedAt: Date | null;
  scheduledPublishAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  translations: Record<string, AdminBlogTranslation>;
  categoryIds: string[];
}

export async function getAdminBlogPostById(
  postId: string
): Promise<AdminBlogPostFull | null> {
  const [post] = await db
    .select({
      id: blogPosts.id,
      slug: blogPosts.slug,
      authorId: blogPosts.authorId,
      mainImageUrl: blogPosts.mainImageUrl,
      mainImagePublicId: blogPosts.mainImagePublicId,
      tags: blogPosts.tags,
      resourceLink: blogPosts.resourceLink,
      isPublished: blogPosts.isPublished,
      publishedAt: blogPosts.publishedAt,
      scheduledPublishAt: blogPosts.scheduledPublishAt,
      createdAt: blogPosts.createdAt,
      updatedAt: blogPosts.updatedAt,
    })
    .from(blogPosts)
    .where(eq(blogPosts.id, postId))
    .limit(1);

  if (!post) return null;

  const transRows = await db
    .select({
      locale: blogPostTranslations.locale,
      title: blogPostTranslations.title,
      body: blogPostTranslations.body,
    })
    .from(blogPostTranslations)
    .where(eq(blogPostTranslations.postId, postId));

  const translations: Record<string, AdminBlogTranslation> = {};
  for (const t of transRows) {
    translations[t.locale] = { title: t.title, body: t.body };
  }

  const catRows = await db
    .select({ categoryId: blogPostCategories.categoryId })
    .from(blogPostCategories)
    .where(eq(blogPostCategories.postId, postId));

  const categoryIds = catRows.map(r => r.categoryId);

  return { ...post, translations, categoryIds };
}

// ── Create ──────────────────────────────────────────────────────

export interface CreateBlogPostInput {
  slug: string;
  authorId: string | null;
  mainImageUrl: string | null;
  mainImagePublicId: string | null;
  tags: string[];
  resourceLink: string | null;
  translations: Record<string, { title: string; body: unknown }>;
  categoryIds: string[];
}

export async function createBlogPost(
  input: CreateBlogPostInput
): Promise<string> {
  const [created] = await db
    .insert(blogPosts)
    .values({
      slug: input.slug,
      authorId: input.authorId,
      mainImageUrl: input.mainImageUrl,
      mainImagePublicId: input.mainImagePublicId,
      tags: input.tags,
      resourceLink: input.resourceLink,
      isPublished: false,
    })
    .returning({ id: blogPosts.id });

  const postId = created.id;

  try {
    for (const [locale, trans] of Object.entries(input.translations)) {
      await db
        .insert(blogPostTranslations)
        .values({
          postId,
          locale,
          title: trans.title,
          body: trans.body,
        })
        .onConflictDoUpdate({
          target: [blogPostTranslations.postId, blogPostTranslations.locale],
          set: { title: trans.title, body: trans.body },
        });
    }

    if (input.categoryIds.length > 0) {
      await db.insert(blogPostCategories).values(
        input.categoryIds.map(categoryId => ({
          postId,
          categoryId,
        }))
      );
    }
  } catch (error) {
    await db.delete(blogPosts).where(eq(blogPosts.id, postId));
    throw error;
  }

  return postId;
}

// ── Update ──────────────────────────────────────────────────────

export interface UpdateBlogPostInput {
  slug?: string;
  authorId?: string | null;
  mainImageUrl?: string | null;
  mainImagePublicId?: string | null;
  tags?: string[];
  resourceLink?: string | null;
  translations?: Record<string, { title: string; body: unknown }>;
  categoryIds?: string[];
}

export async function updateBlogPost(
  postId: string,
  input: UpdateBlogPostInput
): Promise<void> {
  const baseUpdate: Record<string, unknown> = {};
  if (input.slug !== undefined) baseUpdate.slug = input.slug;
  if (input.authorId !== undefined) baseUpdate.authorId = input.authorId;
  if (input.mainImageUrl !== undefined)
    baseUpdate.mainImageUrl = input.mainImageUrl;
  if (input.mainImagePublicId !== undefined)
    baseUpdate.mainImagePublicId = input.mainImagePublicId;
  if (input.tags !== undefined) baseUpdate.tags = input.tags;
  if (input.resourceLink !== undefined)
    baseUpdate.resourceLink = input.resourceLink;

  if (Object.keys(baseUpdate).length > 0) {
    baseUpdate.updatedAt = new Date();
    await db
      .update(blogPosts)
      .set(baseUpdate)
      .where(eq(blogPosts.id, postId));
  }

  if (input.translations) {
    for (const [locale, trans] of Object.entries(input.translations)) {
      await db
        .insert(blogPostTranslations)
        .values({
          postId,
          locale,
          title: trans.title,
          body: trans.body,
        })
        .onConflictDoUpdate({
          target: [blogPostTranslations.postId, blogPostTranslations.locale],
          set: { title: trans.title, body: trans.body },
        });
    }
  }

  if (input.categoryIds !== undefined) {
    await db
      .delete(blogPostCategories)
      .where(eq(blogPostCategories.postId, postId));

    if (input.categoryIds.length > 0) {
      await db.insert(blogPostCategories).values(
        input.categoryIds.map(categoryId => ({
          postId,
          categoryId,
        }))
      );
    }
  }
}

// ── Delete ──────────────────────────────────────────────────────

export async function deleteBlogPost(postId: string): Promise<void> {
  await db.delete(blogPosts).where(eq(blogPosts.id, postId));
}

// ── Publish toggle ──────────────────────────────────────────────

interface PublishOptions {
  isPublished: boolean;
  scheduledPublishAt?: Date | null;
}

export async function toggleBlogPostPublish(
  postId: string,
  opts: PublishOptions
): Promise<void> {
  const now = new Date();

  await db
    .update(blogPosts)
    .set({
      isPublished: opts.isPublished,
      publishedAt: opts.isPublished ? now : null,
      scheduledPublishAt: opts.scheduledPublishAt ?? null,
      updatedAt: now,
    })
    .where(eq(blogPosts.id, postId));
}

// ── Dropdown data ───────────────────────────────────────────────

export interface AdminBlogAuthorOption {
  id: string;
  name: string;
}

export async function getAdminBlogAuthors(): Promise<AdminBlogAuthorOption[]> {
  const rows = await db
    .select({
      id: blogAuthors.id,
      name: blogAuthorTranslations.name,
    })
    .from(blogAuthors)
    .leftJoin(
      blogAuthorTranslations,
      sql`${blogAuthorTranslations.authorId} = ${blogAuthors.id} AND ${blogAuthorTranslations.locale} = ${ADMIN_LOCALE}`
    )
    .orderBy(blogAuthors.displayOrder);

  return rows.map(r => ({
    id: r.id,
    name: r.name ?? '(unnamed)',
  }));
}

export interface AdminBlogCategoryOption {
  id: string;
  slug: string;
  title: string;
}

export async function getAdminBlogCategories(): Promise<
  AdminBlogCategoryOption[]
> {
  const rows = await db
    .select({
      id: blogCategories.id,
      slug: blogCategories.slug,
      title: blogCategoryTranslations.title,
    })
    .from(blogCategories)
    .leftJoin(
      blogCategoryTranslations,
      sql`${blogCategoryTranslations.categoryId} = ${blogCategories.id} AND ${blogCategoryTranslations.locale} = ${ADMIN_LOCALE}`
    )
    .orderBy(blogCategories.displayOrder);

  return rows.map(r => ({
    id: r.id,
    slug: r.slug,
    title: r.title ?? '(untitled)',
  }));
}

// ── Create category (inline from post form) ─────────────────────

export interface CreateBlogCategoryInput {
  slug: string;
  translations: Record<string, { title: string }>;
}

export async function createBlogCategory(
  input: CreateBlogCategoryInput
): Promise<{ id: string; slug: string; title: string }> {
  const [maxRow] = await db
    .select({ max: sql<number>`COALESCE(MAX(${blogCategories.displayOrder}), -1)` })
    .from(blogCategories);

  const [created] = await db
    .insert(blogCategories)
    .values({
      slug: input.slug,
      displayOrder: (maxRow?.max ?? -1) + 1,
    })
    .returning({ id: blogCategories.id });

  const categoryId = created.id;

  try {
    for (const [locale, trans] of Object.entries(input.translations)) {
      await db.insert(blogCategoryTranslations).values({
        categoryId,
        locale,
        title: trans.title,
      });
    }
  } catch (error) {
    await db.delete(blogCategories).where(eq(blogCategories.id, categoryId));
    throw error;
  }

  return {
    id: categoryId,
    slug: input.slug,
    title: input.translations[ADMIN_LOCALE]?.title ?? input.slug,
  };
}

// ── Create author (inline from post form) ────────────────────────

export interface CreateBlogAuthorInput {
  slug: string;
  translations: Record<string, { name: string }>;
}

export async function createBlogAuthor(
  input: CreateBlogAuthorInput
): Promise<{ id: string; name: string }> {
  const [maxRow] = await db
    .select({ max: sql<number>`COALESCE(MAX(${blogAuthors.displayOrder}), -1)` })
    .from(blogAuthors);

  const [created] = await db
    .insert(blogAuthors)
    .values({
      slug: input.slug,
      displayOrder: (maxRow?.max ?? -1) + 1,
    })
    .returning({ id: blogAuthors.id });

  const authorId = created.id;

  try {
    for (const [locale, trans] of Object.entries(input.translations)) {
      await db.insert(blogAuthorTranslations).values({
        authorId,
        locale,
        name: trans.name,
      });
    }
  } catch (error) {
    await db.delete(blogAuthors).where(eq(blogAuthors.id, authorId));
    throw error;
  }

  return {
    id: authorId,
    name: input.translations[ADMIN_LOCALE]?.name ?? input.slug,
  };
}
