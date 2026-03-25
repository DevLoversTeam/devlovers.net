import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

export const aiLearnedTerms = pgTable(
  'ai_learned_terms',
  {
    id: text('id')
      .primaryKey()
      .notNull()
      .default(sql`gen_random_uuid()`),
    userId: text('user_id').notNull(),
    term: text('term').notNull(),
    explanationUk: text('explanation_uk').notNull(),
    explanationEn: text('explanation_en').notNull(),
    explanationPl: text('explanation_pl').notNull(),
    isHidden: boolean('is_hidden').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { mode: 'date' })
      .notNull()
      .default(sql`now()`),
  },
  table => [
    unique('ai_learned_terms_user_term_uniq').on(table.userId, table.term),
  ]
);
