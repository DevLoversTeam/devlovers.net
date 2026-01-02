import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  decimal,
  jsonb,
  primaryKey,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { categories } from './categories';

export const quizzes = pgTable(
  'quizzes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    slug: varchar('slug', { length: 100 }).notNull(),
    displayOrder: integer('display_order').notNull().default(0),
    questionsCount: integer('questions_count').notNull().default(10),
    timeLimitSeconds: integer('time_limit_seconds'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => ({
    categorySlugUnique: unique().on(table.categoryId, table.slug),
    slugIdx: index('quizzes_slug_idx').on(table.slug),
  })
);

export const quizTranslations = pgTable(
  'quiz_translations',
  {
    quizId: uuid('quiz_id')
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    locale: varchar('locale', { length: 5 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
  },
  table => ({
    pk: primaryKey({ columns: [table.quizId, table.locale] }),
  })
);

export const quizQuestions = pgTable(
  'quiz_questions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    quizId: uuid('quiz_id')
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    displayOrder: integer('display_order').notNull(),
    sourceQuestionId: uuid('source_question_id'),
    difficulty: varchar('difficulty', { length: 20 }).default('medium'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => ({
    quizDisplayOrderIdx: index('quiz_questions_quiz_display_order_idx').on(
      table.quizId,
      table.displayOrder
    ),
  })
);

export const quizQuestionContent = pgTable(
  'quiz_question_content',
  {
    quizQuestionId: uuid('quiz_question_id')
      .notNull()
      .references(() => quizQuestions.id, { onDelete: 'cascade' }),
    locale: varchar('locale', { length: 5 }).notNull(),
    questionText: text('question_text').notNull(),
    explanation: jsonb('explanation'),
  },
  table => ({
    pk: primaryKey({ columns: [table.quizQuestionId, table.locale] }),
  })
);

export const quizAnswers = pgTable(
  'quiz_answers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    quizQuestionId: uuid('quiz_question_id')
      .notNull()
      .references(() => quizQuestions.id, { onDelete: 'cascade' }),
    displayOrder: integer('display_order').notNull(),
    isCorrect: boolean('is_correct').notNull().default(false),
  },
  table => ({
    questionDisplayOrderIdx: index(
      'quiz_answers_question_display_order_idx'
    ).on(table.quizQuestionId, table.displayOrder),
  })
);

export const quizAnswerTranslations = pgTable(
  'quiz_answer_translations',
  {
    quizAnswerId: uuid('quiz_answer_id')
      .notNull()
      .references(() => quizAnswers.id, {
        onDelete: 'cascade',
      }),
    locale: varchar('locale', { length: 5 }).notNull(),
    answerText: text('answer_text').notNull(),
  },
  table => ({
    pk: primaryKey({ columns: [table.quizAnswerId, table.locale] }),
  })
);

export const quizAttempts = pgTable(
  'quiz_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').notNull(),
    quizId: uuid('quiz_id')
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    score: integer('score').notNull(),
    totalQuestions: integer('total_questions').notNull(),
    percentage: decimal('percentage', { precision: 5, scale: 2 }).notNull(),
    timeSpentSeconds: integer('time_spent_seconds'),
    integrityScore: integer('integrity_score').default(100),
    metadata: jsonb('metadata').default({}),
    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => ({
    userCompletedAtIdx: index('quiz_attempts_user_completed_at_idx').on(
      table.userId,
      table.completedAt
    ),
    quizPercentageCompletedAtIdx: index(
      'quiz_attempts_quiz_percentage_completed_at_idx'
    ).on(table.quizId, table.percentage, table.completedAt),
    quizIntegrityScoreIdx: index('quiz_attempts_quiz_integrity_score_idx').on(
      table.quizId,
      table.integrityScore
    ),
  })
);

export const quizAttemptAnswers = pgTable(
  'quiz_attempt_answers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => quizAttempts.id, {
        onDelete: 'cascade',
      }),
    quizQuestionId: uuid('quiz_question_id')
      .notNull()
      .references(() => quizQuestions.id, { onDelete: 'cascade' }),
    selectedAnswerId: uuid('selected_answer_id').references(
      () => quizAnswers.id,
      {
        onDelete: 'set null',
      }
    ),
    isCorrect: boolean('is_correct').notNull(),
    answeredAt: timestamp('answered_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => ({
    attemptIdx: index('quiz_attempt_answers_attempt_idx').on(table.attemptId),
  })
);

export const quizzesRelations = relations(quizzes, ({ many }) => ({
  translations: many(quizTranslations),
  questions: many(quizQuestions),
  quizAttempts: many(quizAttempts),
}));

export const quizTranslationsRelations = relations(
  quizTranslations,
  ({ one }) => ({
    quiz: one(quizzes, {
      fields: [quizTranslations.quizId],
      references: [quizzes.id],
    }),
  })
);

export const quizQuestionsRelations = relations(
  quizQuestions,
  ({ one, many }) => ({
    quiz: one(quizzes, {
      fields: [quizQuestions.quizId],
      references: [quizzes.id],
    }),
    content: many(quizQuestionContent),
    answers: many(quizAnswers),
    attemptAnswers: many(quizAttemptAnswers),
  })
);

export const quizQuestionContentRelations = relations(
  quizQuestionContent,
  ({ one }) => ({
    question: one(quizQuestions, {
      fields: [quizQuestionContent.quizQuestionId],
      references: [quizQuestions.id],
    }),
  })
);

export const quizAnswersRelations = relations(quizAnswers, ({ one, many }) => ({
  question: one(quizQuestions, {
    fields: [quizAnswers.quizQuestionId],
    references: [quizQuestions.id],
  }),
  translations: many(quizAnswerTranslations),
  attemptAnswers: many(quizAttemptAnswers),
}));

export const quizAnswerTranslationsRelations = relations(
  quizAnswerTranslations,
  ({ one }) => ({
    answer: one(quizAnswers, {
      fields: [quizAnswerTranslations.quizAnswerId],
      references: [quizAnswers.id],
    }),
  })
);

export const quizAttemptsRelations = relations(
  quizAttempts,
  ({ one, many }) => ({
    quiz: one(quizzes, {
      fields: [quizAttempts.quizId],
      references: [quizzes.id],
    }),

    user: one(users, {
      fields: [quizAttempts.userId],
      references: [users.id],
    }),
    answers: many(quizAttemptAnswers),
  })
);

export const quizAttemptAnswersRelations = relations(
  quizAttemptAnswers,
  ({ one }) => ({
    attempt: one(quizAttempts, {
      fields: [quizAttemptAnswers.attemptId],
      references: [quizAttempts.id],
    }),
    question: one(quizQuestions, {
      fields: [quizAttemptAnswers.quizQuestionId],
      references: [quizQuestions.id],
    }),
    selectedAnswer: one(quizAnswers, {
      fields: [quizAttemptAnswers.selectedAnswerId],
      references: [quizAnswers.id],
    }),
  })
);
