import { z } from 'zod';

const blogTranslationSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  body: z.unknown().default(null),
});

export const createBlogPostSchema = z
  .object({
    slug: z.string().min(1, 'Slug is required'),
    authorId: z.string().uuid().nullable(),
    mainImageUrl: z.string().nullable(),
    mainImagePublicId: z.string().nullable(),
    tags: z.array(z.string()),
    resourceLink: z.string().nullable(),
    translations: z.object({
      en: blogTranslationSchema,
      uk: blogTranslationSchema,
      pl: blogTranslationSchema,
    }),
    categoryIds: z.array(z.string().uuid()),
    publishMode: z.enum(['draft', 'publish', 'schedule']),
    scheduledPublishAt: z.string().nullable(),
  })
  .refine(
    data =>
      data.publishMode !== 'schedule' || (data.scheduledPublishAt && data.scheduledPublishAt.length > 0),
    { message: 'Scheduled date is required', path: ['scheduledPublishAt'] }
  );

export type CreateBlogPostPayload = z.infer<typeof createBlogPostSchema>;

// ── Inline category creation ─────────────────────────────────────

const blogCategoryTranslationSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
});

export const createBlogCategorySchema = z.object({
  slug: z.string().min(1, 'Slug is required'),
  translations: z.object({
    en: blogCategoryTranslationSchema,
    uk: blogCategoryTranslationSchema,
    pl: blogCategoryTranslationSchema,
  }),
});

// ── Inline author creation ───────────────────────────────────────

const blogAuthorTranslationSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  bio: z.string().optional(),
  jobTitle: z.string().optional(),
  company: z.string().optional(),
  city: z.string().optional(),
});

const socialMediaEntrySchema = z.object({
  platform: z.string().min(1),
  url: z.string().url(),
});

export const createBlogAuthorSchema = z.object({
  slug: z.string().min(1, 'Slug is required'),
  imageUrl: z.string().nullable().optional(),
  imagePublicId: z.string().nullable().optional(),
  socialMedia: z.array(socialMediaEntrySchema).optional(),
  translations: z.object({
    en: blogAuthorTranslationSchema,
    uk: blogAuthorTranslationSchema,
    pl: blogAuthorTranslationSchema,
  }),
});

// ── Update author (full form) ────────────────────────────────────

export const updateBlogAuthorSchema = z.object({
  slug: z.string().min(1, 'Slug is required'),
  imageUrl: z.string().nullable(),
  imagePublicId: z.string().nullable(),
  socialMedia: z.array(socialMediaEntrySchema),
  translations: z.object({
    en: blogAuthorTranslationSchema,
    uk: blogAuthorTranslationSchema,
    pl: blogAuthorTranslationSchema,
  }),
});

export type UpdateBlogAuthorPayload = z.infer<typeof updateBlogAuthorSchema>;

// ── Update category (full form) ──────────────────────────────────

export const updateBlogCategorySchema = z.object({
  slug: z.string().min(1, 'Slug is required'),
  translations: z.object({
    en: blogCategoryTranslationSchema,
    uk: blogCategoryTranslationSchema,
    pl: blogCategoryTranslationSchema,
  }),
});

export type UpdateBlogCategoryPayload = z.infer<typeof updateBlogCategorySchema>;

// ── Category reorder ─────────────────────────────────────────────

export const swapCategoryOrderSchema = z.object({
  id1: z.string().uuid(),
  id2: z.string().uuid(),
});