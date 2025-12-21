import { pgTable, uuid, varchar, text, unique } from 'drizzle-orm/pg-core';

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: varchar('slug', { length: 50 }).notNull(),
    locale: varchar('locale', { length: 5 }).notNull(),
    title: text('title').notNull(),
  },
  table => [
    unique('categories_slug_locale_unique').on(table.slug, table.locale),
  ]
);
