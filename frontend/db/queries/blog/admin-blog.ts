import { and,eq, sql } from 'drizzle-orm';

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
 
    baseUpdate.updatedAt = new Date();
    await db
      .update(blogPosts)
      .set(baseUpdate)
      .where(eq(blogPosts.id, postId));

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
  const isScheduling =
    opts.isPublished &&
    opts.scheduledPublishAt != null &&
    opts.scheduledPublishAt > now;
  await db
    .update(blogPosts)
    .set({
      isPublished: opts.isPublished && !isScheduling,
      publishedAt: opts.isPublished && !isScheduling ? now : null,
      scheduledPublishAt: isScheduling ? opts.scheduledPublishAt : null,
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
  translations: Record<string, { title: string; description?: string }>;
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
        description: trans.description ?? null,
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
  imageUrl?: string | null;
  imagePublicId?: string | null;
  socialMedia?: { platform: string; url: string }[];
  translations: Record<string, {
    name: string;
    bio?: string;
    jobTitle?: string;
    company?: string;
    city?: string;
  }>;
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
      ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
      ...(input.imagePublicId !== undefined && { imagePublicId: input.imagePublicId }),
      ...(input.socialMedia !== undefined && { socialMedia: input.socialMedia }),
    })
    .returning({ id: blogAuthors.id });

  const authorId = created.id;

  try {
    for (const [locale, trans] of Object.entries(input.translations)) {
      await db.insert(blogAuthorTranslations).values({
        authorId,
        locale,
        name: trans.name,
        bio: trans.bio ?? null,
        jobTitle: trans.jobTitle ?? null,
        company: trans.company ?? null,
        city: trans.city ?? null,
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

// ── Preview helpers ─────────────────────────────────────────────

export async function getBlogAuthorName(
  authorId: string,
  locale: string
): Promise<string | null> {
  const [row] = await db
    .select({ name: blogAuthorTranslations.name })
    .from(blogAuthorTranslations)
    .where(
      and(
        eq(blogAuthorTranslations.authorId, authorId),
        eq(blogAuthorTranslations.locale, locale)
      )
    )
    .limit(1);
  return row?.name ?? null;
}

export async function getBlogPostCategoryName(
  postId: string,
  locale: string
): Promise<string | null> {
  const [row] = await db
    .select({ title: blogCategoryTranslations.title })
    .from(blogPostCategories)
    .innerJoin(
      blogCategoryTranslations,
      and(
        eq(blogCategoryTranslations.categoryId, blogPostCategories.categoryId),
        eq(blogCategoryTranslations.locale, locale)
      )
    )
    .innerJoin(
      blogCategories,
      eq(blogCategories.id, blogPostCategories.categoryId)
    )
    .where(eq(blogPostCategories.postId, postId))
    .orderBy(blogCategories.displayOrder)
    .limit(1);
  return row?.title ?? null;
}

// ── Authors management ──────────────────────────────────────────

export interface AdminBlogAuthorListItem {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  jobTitle: string | null;
  postCount: number;
}

export async function getAdminBlogAuthorsFull(): Promise<AdminBlogAuthorListItem[]> {
  const postCountSq = db
    .select({
      authorId: blogPosts.authorId,
      cnt: sql<number>`COUNT(*)`.as('cnt'),
    })
    .from(blogPosts)
    .groupBy(blogPosts.authorId)
    .as('post_counts');

  const rows = await db
    .select({
      id: blogAuthors.id,
      slug: blogAuthors.slug,
      name: blogAuthorTranslations.name,
      imageUrl: blogAuthors.imageUrl,
      jobTitle: blogAuthorTranslations.jobTitle,
      postCount: postCountSq.cnt,
    })
    .from(blogAuthors)
    .leftJoin(
      blogAuthorTranslations,
      sql`${blogAuthorTranslations.authorId} = ${blogAuthors.id} AND ${blogAuthorTranslations.locale} = ${ADMIN_LOCALE}`
    )
    .leftJoin(postCountSq, eq(postCountSq.authorId, blogAuthors.id))
    .orderBy(blogAuthors.displayOrder);

  return rows.map(r => ({
    id: r.id,
    slug: r.slug,
    name: r.name ?? '(unnamed)',
    imageUrl: r.imageUrl,
    jobTitle: r.jobTitle ?? null,
    postCount: r.postCount ?? 0,
  }));
}

export interface AdminBlogAuthorTranslation {
  name: string;
  bio: string | null;
  jobTitle: string | null;
  company: string | null;
  city: string | null;
}

export interface AdminBlogAuthorFull {
  id: string;
  slug: string;
  imageUrl: string | null;
  imagePublicId: string | null;
  socialMedia: { platform: string; url: string }[];
  translations: Record<string, AdminBlogAuthorTranslation>;
}

export async function getAdminBlogAuthorById(
  authorId: string
): Promise<AdminBlogAuthorFull | null> {
  const [author] = await db
    .select({
      id: blogAuthors.id,
      slug: blogAuthors.slug,
      imageUrl: blogAuthors.imageUrl,
      imagePublicId: blogAuthors.imagePublicId,
      socialMedia: blogAuthors.socialMedia,
    })
    .from(blogAuthors)
    .where(eq(blogAuthors.id, authorId))
    .limit(1);

  if (!author) return null;

  const transRows = await db
    .select({
      locale: blogAuthorTranslations.locale,
      name: blogAuthorTranslations.name,
      bio: blogAuthorTranslations.bio,
      jobTitle: blogAuthorTranslations.jobTitle,
      company: blogAuthorTranslations.company,
      city: blogAuthorTranslations.city,
    })
    .from(blogAuthorTranslations)
    .where(eq(blogAuthorTranslations.authorId, authorId));

  const translations: Record<string, AdminBlogAuthorTranslation> = {};
  for (const t of transRows) {
    translations[t.locale] = {
      name: t.name,
      bio: t.bio,
      jobTitle: t.jobTitle,
      company: t.company,
      city: t.city,
    };
  }

  return {
    ...author,
    socialMedia: (author.socialMedia as { platform: string; url: string }[]) ?? [],
    translations,
  };
}

export interface UpdateBlogAuthorInput {
  slug: string;
  imageUrl: string | null;
  imagePublicId: string | null;
  socialMedia: { platform: string; url: string }[];
  translations: Record<string, {
    name: string;
    bio?: string;
    jobTitle?: string;
    company?: string;
    city?: string;
  }>;
}

export async function updateBlogAuthor(
  authorId: string,
  input: UpdateBlogAuthorInput
): Promise<void> {
  await db
    .update(blogAuthors)
    .set({
      slug: input.slug,
      imageUrl: input.imageUrl,
      imagePublicId: input.imagePublicId,
      socialMedia: input.socialMedia,
      updatedAt: new Date(),
    })
    .where(eq(blogAuthors.id, authorId));

  for (const [locale, trans] of Object.entries(input.translations)) {
    await db
      .insert(blogAuthorTranslations)
      .values({
        authorId,
        locale,
        name: trans.name,
        bio: trans.bio ?? null,
        jobTitle: trans.jobTitle ?? null,
        company: trans.company ?? null,
        city: trans.city ?? null,
      })
      .onConflictDoUpdate({
        target: [blogAuthorTranslations.authorId, blogAuthorTranslations.locale],
        set: {
          name: trans.name,
          bio: trans.bio ?? null,
          jobTitle: trans.jobTitle ?? null,
          company: trans.company ?? null,
          city: trans.city ?? null,
        },
      });
  }
}

export async function deleteBlogAuthor(authorId: string): Promise<void> {
  const [row] = await db
    .select({ cnt: sql<number>`COUNT(*)` })
    .from(blogPosts)
    .where(eq(blogPosts.authorId, authorId));

  if ((row?.cnt ?? 0) > 0) {
    throw new Error('AUTHOR_HAS_POSTS');
  }

  await db.delete(blogAuthors).where(eq(blogAuthors.id, authorId));
}

// ── Categories management ───────────────────────────────────────

export interface AdminBlogCategoryTranslation {
  title: string;
  description: string | null;
}

export interface AdminBlogCategoryListItem {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  postCount: number;
  displayOrder: number;
  translations: Record<string, AdminBlogCategoryTranslation>;
}

export async function getAdminBlogCategoriesFull(): Promise<AdminBlogCategoryListItem[]> {
  const postCountSq = db
    .select({
      categoryId: blogPostCategories.categoryId,
      cnt: sql<number>`COUNT(*)`.as('cnt'),
    })
    .from(blogPostCategories)
    .groupBy(blogPostCategories.categoryId)
    .as('cat_post_counts');

  const rows = await db
    .select({
      id: blogCategories.id,
      slug: blogCategories.slug,
      displayOrder: blogCategories.displayOrder,
      postCount: postCountSq.cnt,
    })
    .from(blogCategories)
    .leftJoin(postCountSq, eq(postCountSq.categoryId, blogCategories.id))
    .orderBy(blogCategories.displayOrder);

  const allTrans = await db
    .select({
      categoryId: blogCategoryTranslations.categoryId,
      locale: blogCategoryTranslations.locale,
      title: blogCategoryTranslations.title,
      description: blogCategoryTranslations.description,
    })
    .from(blogCategoryTranslations);

  const transMap = new Map<string, Record<string, AdminBlogCategoryTranslation>>();
  for (const t of allTrans) {
    if (!transMap.has(t.categoryId)) transMap.set(t.categoryId, {});
    transMap.get(t.categoryId)![t.locale] = {
      title: t.title,
      description: t.description,
    };
  }

  return rows.map(r => {
    const trans = transMap.get(r.id) ?? {};
    return {
      id: r.id,
      slug: r.slug,
      title: trans[ADMIN_LOCALE]?.title ?? '(untitled)',
      description: trans[ADMIN_LOCALE]?.description ?? null,
      postCount: r.postCount ?? 0,
      displayOrder: r.displayOrder,
      translations: trans,
    };
  });
}

export interface AdminBlogCategoryFull {
  id: string;
  slug: string;
  displayOrder: number;
  translations: Record<string, AdminBlogCategoryTranslation>;
}

export async function getAdminBlogCategoryById(
  categoryId: string
): Promise<AdminBlogCategoryFull | null> {
  const [category] = await db
    .select({
      id: blogCategories.id,
      slug: blogCategories.slug,
      displayOrder: blogCategories.displayOrder,
    })
    .from(blogCategories)
    .where(eq(blogCategories.id, categoryId))
    .limit(1);

  if (!category) return null;

  const transRows = await db
    .select({
      locale: blogCategoryTranslations.locale,
      title: blogCategoryTranslations.title,
      description: blogCategoryTranslations.description,
    })
    .from(blogCategoryTranslations)
    .where(eq(blogCategoryTranslations.categoryId, categoryId));

  const translations: Record<string, AdminBlogCategoryTranslation> = {};
  for (const t of transRows) {
    translations[t.locale] = { title: t.title, description: t.description };
  }

  return { ...category, translations };
}

export interface UpdateBlogCategoryInput {
  slug: string;
  translations: Record<string, { title: string; description?: string }>;
}

export async function updateBlogCategory(
  categoryId: string,
  input: UpdateBlogCategoryInput
): Promise<void> {
  await db
    .update(blogCategories)
    .set({ slug: input.slug })
    .where(eq(blogCategories.id, categoryId));

  for (const [locale, trans] of Object.entries(input.translations)) {
    await db
      .insert(blogCategoryTranslations)
      .values({
        categoryId,
        locale,
        title: trans.title,
        description: trans.description ?? null,
      })
      .onConflictDoUpdate({
        target: [blogCategoryTranslations.categoryId, blogCategoryTranslations.locale],
        set: {
          title: trans.title,
          description: trans.description ?? null,
        },
      });
  }
}

export async function deleteBlogCategory(categoryId: string): Promise<void> {
  const [row] = await db
    .select({ cnt: sql<number>`COUNT(*)` })
    .from(blogPostCategories)
    .where(eq(blogPostCategories.categoryId, categoryId));

  if ((row?.cnt ?? 0) > 0) {
    throw new Error('CATEGORY_HAS_POSTS');
  }

  await db.delete(blogCategories).where(eq(blogCategories.id, categoryId));
}

export async function swapBlogCategoryOrder(
  id1: string,
  id2: string
): Promise<void> {
  const rows = await db
    .select({ id: blogCategories.id, displayOrder: blogCategories.displayOrder })
    .from(blogCategories)
    .where(sql`${blogCategories.id} IN (${id1}, ${id2})`);

  if (rows.length !== 2) throw new Error('CATEGORIES_NOT_FOUND');

  const order1 = rows.find(r => r.id === id1)!.displayOrder;
  const order2 = rows.find(r => r.id === id2)!.displayOrder;

  await db
    .update(blogCategories)
    .set({ displayOrder: order2 })
    .where(eq(blogCategories.id, id1));

  await db
    .update(blogCategories)
    .set({ displayOrder: order1 })
    .where(eq(blogCategories.id, id2));
}
