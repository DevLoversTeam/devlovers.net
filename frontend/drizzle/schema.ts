import {
  pgTable,
  unique,
  text,
  foreignKey,
  jsonb,
  integer,
  index,
  uuid,
  boolean,
  varchar,
  timestamp,
  numeric,
  primaryKey,
} from 'drizzle-orm/pg-core';

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

export const questions = pgTable(
  'questions',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    question: text('question').notNull(),
    answerBlocks: jsonb('answer_blocks').notNull(),
    categoryId: uuid('category_id').notNull(),
  },
  table => [
    foreignKey({
      columns: [table.categoryId],
      foreignColumns: [categories.id],
      name: 'questions_category_id_categories_id_fk',
    }).onDelete('cascade'),
  ]
);

export const quizAnswers = pgTable(
  'quiz_answers',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    quizQuestionId: uuid('quiz_question_id').notNull(),
    displayOrder: integer('display_order').notNull(),
    isCorrect: boolean('is_correct').default(false).notNull(),
  },
  table => [
    index('quiz_answers_question_display_order_idx').using(
      'btree',
      table.quizQuestionId.asc().nullsLast().op('int4_ops'),
      table.displayOrder.asc().nullsLast().op('int4_ops')
    ),
    foreignKey({
      columns: [table.quizQuestionId],
      foreignColumns: [quizQuestions.id],
      name: 'quiz_answers_quiz_question_id_quiz_questions_id_fk',
    }).onDelete('cascade'),
  ]
);

export const quizQuestions = pgTable(
  'quiz_questions',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    quizId: uuid('quiz_id').notNull(),
    displayOrder: integer('display_order').notNull(),
    sourceQuestionId: uuid('source_question_id'),
    difficulty: varchar({ length: 20 }).default('medium'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
    index('quiz_questions_quiz_display_order_idx').using(
      'btree',
      table.quizId.asc().nullsLast().op('int4_ops'),
      table.displayOrder.asc().nullsLast().op('int4_ops')
    ),
    foreignKey({
      columns: [table.quizId],
      foreignColumns: [quizzes.id],
      name: 'quiz_questions_quiz_id_quizzes_id_fk',
    }).onDelete('cascade'),
  ]
);

export const quizAttemptAnswers = pgTable(
  'quiz_attempt_answers',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    attemptId: uuid('attempt_id').notNull(),
    quizQuestionId: uuid('quiz_question_id').notNull(),
    selectedAnswerId: uuid('selected_answer_id'),
    isCorrect: boolean('is_correct').notNull(),
    answeredAt: timestamp('answered_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
    index('quiz_attempt_answers_attempt_idx').using(
      'btree',
      table.attemptId.asc().nullsLast().op('uuid_ops')
    ),
    foreignKey({
      columns: [table.attemptId],
      foreignColumns: [quizAttempts.id],
      name: 'quiz_attempt_answers_attempt_id_quiz_attempts_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.quizQuestionId],
      foreignColumns: [quizQuestions.id],
      name: 'quiz_attempt_answers_quiz_question_id_quiz_questions_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.selectedAnswerId],
      foreignColumns: [quizAnswers.id],
      name: 'quiz_attempt_answers_selected_answer_id_quiz_answers_id_fk',
    }).onDelete('set null'),
  ]
);

export const quizzes = pgTable(
  'quizzes',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    topicId: uuid('topic_id').notNull(),
    slug: varchar({ length: 100 }).notNull(),
    displayOrder: integer('display_order').default(0).notNull(),
    questionsCount: integer('questions_count').default(10).notNull(),
    timeLimitSeconds: integer('time_limit_seconds'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
    unique('quizzes_topic_id_slug_unique').on(table.topicId, table.slug),
  ]
);

export const quizAttempts = pgTable(
  'quiz_attempts',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: text('user_id').notNull(),
    quizId: uuid('quiz_id').notNull(),
    score: integer().notNull(),
    totalQuestions: integer('total_questions').notNull(),
    percentage: numeric({ precision: 5, scale: 2 }).notNull(),
    timeSpentSeconds: integer('time_spent_seconds'),
    integrityScore: integer('integrity_score').default(100),
    metadata: jsonb().default({}),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    completedAt: timestamp('completed_at', {
      withTimezone: true,
      mode: 'string',
    })
      .defaultNow()
      .notNull(),
  },
  table => [
    index('quiz_attempts_quiz_integrity_score_idx').using(
      'btree',
      table.quizId.asc().nullsLast().op('uuid_ops'),
      table.integrityScore.asc().nullsLast().op('int4_ops')
    ),
    index('quiz_attempts_quiz_percentage_completed_at_idx').using(
      'btree',
      table.quizId.asc().nullsLast().op('numeric_ops'),
      table.percentage.asc().nullsLast().op('numeric_ops'),
      table.completedAt.asc().nullsLast().op('uuid_ops')
    ),
    index('quiz_attempts_user_completed_at_idx').using(
      'btree',
      table.userId.asc().nullsLast().op('text_ops'),
      table.completedAt.asc().nullsLast().op('text_ops')
    ),
    foreignKey({
      columns: [table.quizId],
      foreignColumns: [quizzes.id],
      name: 'quiz_attempts_quiz_id_quizzes_id_fk',
    }).onDelete('cascade'),
  ]
);

export const user = pgTable('user', {
  id: text('id').primaryKey().notNull(),
  name: text(),
  email: text().notNull(),
  emailVerified: timestamp('email_verified', { mode: 'string' }),
  image: text(),
  role: text().default('user'),
  points: integer().default(0),
  preferredLocale: varchar('preferred_locale', { length: 5 }).default('en'),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
});

export const pointTransactions = pgTable(
  'point_transactions',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: text('user_id').notNull(),
    points: integer().default(0).notNull(),
    source: varchar({ length: 50 }).default('quiz').notNull(),
    sourceId: uuid('source_id'),
    metadata: jsonb().default({}),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
      name: 'point_transactions_user_id_user_id_fk',
    }).onDelete('cascade'),
  ]
);

export const quizAnswerTranslations = pgTable(
  'quiz_answer_translations',
  {
    quizAnswerId: uuid('quiz_answer_id').notNull(),
    locale: varchar({ length: 5 }).notNull(),
    answerText: text('answer_text').notNull(),
  },
  table => [
    foreignKey({
      columns: [table.quizAnswerId],
      foreignColumns: [quizAnswers.id],
      name: 'quiz_answer_translations_quiz_answer_id_quiz_answers_id_fk',
    }).onDelete('cascade'),
    primaryKey({
      columns: [table.quizAnswerId, table.locale],
      name: 'quiz_answer_translations_quiz_answer_id_locale_pk',
    }),
  ]
);

export const quizQuestionContent = pgTable(
  'quiz_question_content',
  {
    quizQuestionId: uuid('quiz_question_id').notNull(),
    locale: varchar({ length: 5 }).notNull(),
    questionText: text('question_text').notNull(),
    explanation: jsonb(),
  },
  table => [
    foreignKey({
      columns: [table.quizQuestionId],
      foreignColumns: [quizQuestions.id],
      name: 'quiz_question_content_quiz_question_id_quiz_questions_id_fk',
    }).onDelete('cascade'),
    primaryKey({
      columns: [table.quizQuestionId, table.locale],
      name: 'quiz_question_content_quiz_question_id_locale_pk',
    }),
  ]
);

export const quizTranslations = pgTable(
  'quiz_translations',
  {
    quizId: uuid('quiz_id').notNull(),
    locale: varchar({ length: 5 }).notNull(),
    title: varchar({ length: 200 }).notNull(),
    description: text(),
  },
  table => [
    foreignKey({
      columns: [table.quizId],
      foreignColumns: [quizzes.id],
      name: 'quiz_translations_quiz_id_quizzes_id_fk',
    }).onDelete('cascade'),
    primaryKey({
      columns: [table.quizId, table.locale],
      name: 'quiz_translations_quiz_id_locale_pk',
    }),
  ]
);
