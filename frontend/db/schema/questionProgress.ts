import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { questions } from './questions';
import { users } from './users';

export const userQuestionProgress = pgTable(
  'user_question_progress',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    viewedAt: timestamp('viewed_at', { withTimezone: true }),
    bookmarkedAt: timestamp('bookmarked_at', { withTimezone: true }),
    lastOpenedAt: timestamp('last_opened_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => ({
    pk: primaryKey({ columns: [table.userId, table.questionId] }),
    userBookmarkedAtIdx: index(
      'user_question_progress_user_bookmarked_at_idx'
    ).on(table.userId, table.bookmarkedAt),
    userLastOpenedAtIdx: index(
      'user_question_progress_user_last_opened_at_idx'
    ).on(table.userId, table.lastOpenedAt),
    questionIdIdx: index('user_question_progress_question_id_idx').on(
      table.questionId
    ),
    hasStateCheck: check(
      'user_question_progress_has_state_check',
      sql`${table.viewedAt} is not null or ${table.bookmarkedAt} is not null`
    ),
  })
);

export const userQuestionProgressRelations = relations(
  userQuestionProgress,
  ({ one }) => ({
    user: one(users, {
      fields: [userQuestionProgress.userId],
      references: [users.id],
    }),
    question: one(questions, {
      fields: [userQuestionProgress.questionId],
      references: [questions.id],
    }),
  })
);
