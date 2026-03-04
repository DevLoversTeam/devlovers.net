import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// ── Blog Categories ──────────────────────────────────────────────

export const blogCategories = pgTable('blog_categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: varchar('slug', { length: 50 }).notNull().unique(),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const blogCategoryTranslations = pgTable(
  'blog_category_translations',
  {
    categoryId: uuid('category_id')
      .notNull()
      .references(() => blogCategories.id, { onDelete: 'cascade' }),
    locale: varchar('locale', { length: 5 }).notNull(),
    title: text('title').notNull(),
    description: text('description'),
  },
  table => ({
    pk: primaryKey({ columns: [table.categoryId, table.locale] }),
  })
);

// ── Blog Authors ─────────────────────────────────────────────────

export const blogAuthors = pgTable('blog_authors', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  imageUrl: text('image_url'),
  imagePublicId: text('image_public_id'),
  socialMedia: jsonb('social_media').notNull().default([]),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const blogAuthorTranslations = pgTable(
  'blog_author_translations',
  {
    authorId: uuid('author_id')
      .notNull()
      .references(() => blogAuthors.id, { onDelete: 'cascade' }),
    locale: varchar('locale', { length: 5 }).notNull(),
    name: text('name').notNull(),
    bio: text('bio'),
    jobTitle: text('job_title'),
    company: text('company'),
    city: text('city'),
  },
  table => ({
    pk: primaryKey({ columns: [table.authorId, table.locale] }),
  })
);

// ── Blog Posts ───────────────────────────────────────────────────

export const blogPosts = pgTable(
  'blog_posts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: varchar('slug', { length: 200 }).notNull().unique(),
    authorId: uuid('author_id').references(() => blogAuthors.id, {
      onDelete: 'set null',
    }),
    mainImageUrl: text('main_image_url'),
    mainImagePublicId: text('main_image_public_id'),
    tags: text('tags').array().notNull().default([]),
    resourceLink: text('resource_link'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    scheduledPublishAt: timestamp('scheduled_publish_at', {
      withTimezone: true,
    }),
    isPublished: boolean('is_published').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => ({
    authorIdx: index('blog_posts_author_id_idx').on(table.authorId),
  })
);

export const blogPostTranslations = pgTable(
  'blog_post_translations',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => blogPosts.id, { onDelete: 'cascade' }),
    locale: varchar('locale', { length: 5 }).notNull(),
    title: text('title').notNull(),
    body: jsonb('body'),
  },
  table => ({
    pk: primaryKey({ columns: [table.postId, table.locale] }),
  })
);

// ── Blog Post ↔ Category junction ───────────────────────────────

export const blogPostCategories = pgTable(
  'blog_post_categories',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => blogPosts.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => blogCategories.id, { onDelete: 'cascade' }),
  },
  table => ({
    pk: primaryKey({ columns: [table.postId, table.categoryId] }),
    categoryIdx: index('blog_post_categories_category_id_idx').on(
      table.categoryId
    ),
  })
);

// ── Relations ───────────────────────────────────────────────────

export const blogCategoriesRelations = relations(
  blogCategories,
  ({ many }) => ({
    translations: many(blogCategoryTranslations),
    posts: many(blogPostCategories),
  })
);

export const blogCategoryTranslationsRelations = relations(
  blogCategoryTranslations,
  ({ one }) => ({
    category: one(blogCategories, {
      fields: [blogCategoryTranslations.categoryId],
      references: [blogCategories.id],
    }),
  })
);

export const blogAuthorsRelations = relations(blogAuthors, ({ many }) => ({
  translations: many(blogAuthorTranslations),
  posts: many(blogPosts),
}));

export const blogAuthorTranslationsRelations = relations(
  blogAuthorTranslations,
  ({ one }) => ({
    author: one(blogAuthors, {
      fields: [blogAuthorTranslations.authorId],
      references: [blogAuthors.id],
    }),
  })
);

export const blogPostsRelations = relations(blogPosts, ({ one, many }) => ({
  author: one(blogAuthors, {
    fields: [blogPosts.authorId],
    references: [blogAuthors.id],
  }),
  translations: many(blogPostTranslations),
  categories: many(blogPostCategories),
}));

export const blogPostTranslationsRelations = relations(
  blogPostTranslations,
  ({ one }) => ({
    post: one(blogPosts, {
      fields: [blogPostTranslations.postId],
      references: [blogPosts.id],
    }),
  })
);

export const blogPostCategoriesRelations = relations(
  blogPostCategories,
  ({ one }) => ({
    post: one(blogPosts, {
      fields: [blogPostCategories.postId],
      references: [blogPosts.id],
    }),
    category: one(blogCategories, {
      fields: [blogPostCategories.categoryId],
      references: [blogCategories.id],
    }),
  })
);
