import { relations } from 'drizzle-orm';
import {
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

import { categories } from './categories';

export const questions = pgTable(
  'questions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    sortOrder: integer('sort_order').notNull().default(0),
    difficulty: varchar('difficulty', { length: 20 }).default('medium'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => ({
    categorySortOrderIdx: index('questions_category_sort_order_idx').on(
      table.categoryId,
      table.sortOrder
    ),
  })
);

export const questionTranslations = pgTable(
  'question_translations',
  {
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    locale: varchar('locale', { length: 5 }).notNull(),
    question: text('question').notNull(),
    answerBlocks: jsonb('answer_blocks').notNull(),
  },
  table => ({
    pk: primaryKey({ columns: [table.questionId, table.locale] }),
  })
);

export const questionsRelations = relations(questions, ({ one, many }) => ({
  category: one(categories, {
    fields: [questions.categoryId],
    references: [categories.id],
  }),
  translations: many(questionTranslations),
}));

export const questionTranslationsRelations = relations(
  questionTranslations,
  ({ one }) => ({
    question: one(questions, {
      fields: [questionTranslations.questionId],
      references: [questions.id],
    }),
  })
);
