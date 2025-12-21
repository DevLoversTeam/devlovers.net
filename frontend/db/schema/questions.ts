import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  integer,
  unique,
} from 'drizzle-orm/pg-core';

export const questions = pgTable(
  'questions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    categorySlug: varchar('category_slug', { length: 50 }).notNull(),
    locale: varchar('locale', { length: 5 }).notNull(),
    question: text('question').notNull(),
    answerBlocks: jsonb('answer_blocks').notNull(),
    sortOrder: integer('sort_order').default(0),
  },
  table => [
    unique('questions_category_locale_order_unique').on(
      table.categorySlug,
      table.locale,
      table.sortOrder
    ),
  ]
);
