import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { cache } from 'react';

import { getOrCreateQuestionsCache } from '@/lib/quiz/quiz-answers-redis';
import type {
  AttemptQuestionDetail,
  AttemptReview,
  QuizQuestionWithAnswers,
  UserLastAttempt,
} from '@/types/quiz';

import { db } from '../../index';
import { categories, categoryTranslations } from '../../schema/categories';
import {
  quizAnswers,
  quizAnswerTranslations,
  quizAttemptAnswers,
  quizAttempts,
  quizQuestionContent,
  quizQuestions,
  quizTranslations,
  quizzes,
} from '../../schema/quiz';
export type { QuizAnswer, QuizQuestion, QuizQuestionWithAnswers } from '@/types/quiz';

export interface Quiz {
  id: string;
  slug: string;
  title: string | null;
  description: string | null;
  questionsCount: number;
  timeLimitSeconds: number | null;
  isActive: boolean;
  categorySlug: string | null;
  categoryName: string | null;
}


export interface QuizAnswerClient {
  id: string;
  displayOrder: number;
  answerText: string | null;
}

export interface QuizQuestionClient {
  id: string;
  displayOrder: number;
  difficulty: string | null;
  questionText: string | null;
  explanation: any;
  answers: QuizAnswerClient[];
}

const attemptReviewCache = new Map<string, AttemptReview>();

function getAttemptReviewCacheKey(attemptId: string, userId: string, locale: string) {
  return `${attemptId}:${userId}:${locale}`;
}

async function getCachedAttemptReview(
  attemptId: string,
  userId: string,
  locale: string
): Promise<AttemptReview | null> {
  return attemptReviewCache.get(getAttemptReviewCacheKey(attemptId, userId, locale)) ?? null;
}

async function cacheAttemptReview(
  attemptId: string,
  userId: string,
  locale: string,
  review: AttemptReview
): Promise<void> {
  attemptReviewCache.set(getAttemptReviewCacheKey(attemptId, userId, locale), review);
}

export function stripCorrectAnswers(
  questions: QuizQuestionWithAnswers[]
): QuizQuestionClient[] {
  return questions.map(q => ({
    id: q.id,
    displayOrder: q.displayOrder,
    difficulty: q.difficulty,
    questionText: q.questionText,
    explanation: q.explanation,
    answers: q.answers.map(a => ({
      id: a.id,
      displayOrder: a.displayOrder,
      answerText: a.answerText,
    })),
  }));
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  percentage: string;
  completedAt: Date;
  attemptsCount: number;
}

export interface QuizAttempt {
  id: string;
  userId: string;
  quizId: string;
  score: number;
  totalQuestions: number;
  percentage: string;
  timeSpentSeconds: number | null;
  integrityScore: number | null;
  completedAt: Date;
}

export const getQuizBySlug = cache(
  async (slug: string, locale: string = 'uk'): Promise<Quiz | null> => {
    const cached = unstable_cache(
      async (): Promise<Quiz | null> => {
        const result = await db
          .select({
            id: quizzes.id,
            slug: quizzes.slug,
            questionsCount: quizzes.questionsCount,
            timeLimitSeconds: quizzes.timeLimitSeconds,
            isActive: quizzes.isActive,
            title: quizTranslations.title,
            description: quizTranslations.description,
            categorySlug: categories.slug,
            categoryName: categoryTranslations.title,
          })
          .from(quizzes)
          .leftJoin(
            quizTranslations,
            and(
              eq(quizTranslations.quizId, quizzes.id),
              eq(quizTranslations.locale, locale)
            )
          )
          .leftJoin(categories, eq(categories.id, quizzes.categoryId))
          .leftJoin(
            categoryTranslations,
            and(
              eq(categoryTranslations.categoryId, categories.id),
              eq(categoryTranslations.locale, locale)
            )
          )
          .where(eq(quizzes.slug, slug))
          .limit(1);

        if (!result.length) return null;

        return result[0];
      },
      ['quiz-by-slug', slug, locale],
      { revalidate: 300 }
    );

    return cached();
  }
);

export const getActiveQuizzes = cache(
  async (locale: string = 'uk'): Promise<Quiz[]> => {
    const cached = unstable_cache(
      async (): Promise<Quiz[]> => {
        const rows = await db
          .select({
            id: quizzes.id,
            slug: quizzes.slug,
            questionsCount: quizzes.questionsCount,
            timeLimitSeconds: quizzes.timeLimitSeconds,
            isActive: quizzes.isActive,
            title: quizTranslations.title,
            description: quizTranslations.description,
            categorySlug: categories.slug,
            categoryName: categoryTranslations.title,
          })
          .from(quizzes)
          .leftJoin(
            quizTranslations,
            and(
              eq(quizTranslations.quizId, quizzes.id),
              eq(quizTranslations.locale, locale)
            )
          )
          .leftJoin(categories, eq(categories.id, quizzes.categoryId))
          .leftJoin(
            categoryTranslations,
            and(
              eq(categoryTranslations.categoryId, categories.id),
              eq(categoryTranslations.locale, locale)
            )
          )
          .where(and(eq(quizzes.isActive, true), eq(quizzes.status, 'ready')))
          .orderBy(categories.displayOrder, quizzes.displayOrder);

        return rows;
      },
      ['active-quizzes', locale],
      { revalidate: 300 }
    );

    return cached();
  }
);

export async function getQuizQuestions(
  quizId: string,
  locale: string = 'uk'
): Promise<QuizQuestionWithAnswers[]> {
  const cached = await getOrCreateQuestionsCache(quizId, locale);
  if (cached !== null) {
    return cached;
  }
  const questionsData = await db
    .select({
      id: quizQuestions.id,
      displayOrder: quizQuestions.displayOrder,
      difficulty: quizQuestions.difficulty,
      questionText: quizQuestionContent.questionText,
      explanation: quizQuestionContent.explanation,
    })
    .from(quizQuestions)
    .leftJoin(
      quizQuestionContent,
      and(
        eq(quizQuestionContent.quizQuestionId, quizQuestions.id),
        eq(quizQuestionContent.locale, locale)
      )
    )
    .where(eq(quizQuestions.quizId, quizId))
    .orderBy(quizQuestions.displayOrder);

  if (questionsData.length === 0) return [];

  const questionIds = questionsData.map(q => q.id);

  const allAnswers = await db
    .select({
      id: quizAnswers.id,
      questionId: quizAnswers.quizQuestionId,
      displayOrder: quizAnswers.displayOrder,
      isCorrect: quizAnswers.isCorrect,
      answerText: quizAnswerTranslations.answerText,
    })
    .from(quizAnswers)
    .leftJoin(
      quizAnswerTranslations,
      and(
        eq(quizAnswerTranslations.quizAnswerId, quizAnswers.id),
        eq(quizAnswerTranslations.locale, locale)
      )
    )
    .where(inArray(quizAnswers.quizQuestionId, questionIds))
    .orderBy(quizAnswers.displayOrder);

  const answersByQuestion = new Map<string, typeof allAnswers>();
  for (const answer of allAnswers) {
    const existing = answersByQuestion.get(answer.questionId) || [];
    existing.push(answer);
    answersByQuestion.set(answer.questionId, existing);
  }

  return questionsData.map(question => ({
    ...question,
    answers: (answersByQuestion.get(question.id) || []).map(a => ({
      id: a.id,
      displayOrder: a.displayOrder,
      isCorrect: a.isCorrect,
      answerText: a.answerText,
    })),
  }));
}

export function randomizeQuizQuestions(
  questions: QuizQuestionWithAnswers[],
  seed?: number
): QuizQuestionWithAnswers[] {
  const seededRandom = (index: number) => {
    const x = Math.sin(seed ? seed + index : index) * 10000;
    return x - Math.floor(x);
  };

  const shuffledQuestions = [...questions]
    .map((q, i) => ({ question: q, sort: seededRandom(i) }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ question }) => question);

  return shuffledQuestions.map((question, qIndex) => ({
    ...question,
    answers: [...question.answers]
      .map((a, i) => ({ answer: a, sort: seededRandom(qIndex * 100 + i) }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ answer }) => answer),
  }));
}

export async function getQuizQuestionsRandomized(
  quizId: string,
  locale: string = 'uk',
  seed?: number
): Promise<QuizQuestionWithAnswers[]> {
  const questions = await getQuizQuestions(quizId, locale);
  return randomizeQuizQuestions(questions, seed);
}

export async function getQuizLeaderboard(
  quizId: string,
  limit: number = 10
): Promise<LeaderboardEntry[]> {
  const leaderboard = await db
    .select({
      userId: quizAttempts.userId,
      percentage: quizAttempts.percentage,
      completedAt: quizAttempts.completedAt,
      integrityScore: quizAttempts.integrityScore,
    })
    .from(quizAttempts)
    .where(
      and(
        eq(quizAttempts.quizId, quizId),
        sql`${quizAttempts.integrityScore} >= 70`
      )
    )
    .orderBy(desc(quizAttempts.percentage), quizAttempts.completedAt)
    .limit(limit);

  return leaderboard.map((entry, index) => ({
    rank: index + 1,
    userId: entry.userId,
    percentage: entry.percentage,
    completedAt: entry.completedAt,
    attemptsCount: 1,
  }));
}

export async function getUserBestAttempt(
  userId: string,
  quizId: string
): Promise<QuizAttempt | null> {
  const result = await db
    .select()
    .from(quizAttempts)
    .where(
      and(eq(quizAttempts.userId, userId), eq(quizAttempts.quizId, quizId))
    )
    .orderBy(desc(quizAttempts.percentage))
    .limit(1);

  if (!result.length) return null;

  return result[0] as QuizAttempt;
}

export async function getUserQuizHistory(
  userId: string,
  quizId: string
): Promise<QuizAttempt[]> {
  const attempts = await db
    .select()
    .from(quizAttempts)
    .where(
      and(eq(quizAttempts.userId, userId), eq(quizAttempts.quizId, quizId))
    )
    .orderBy(desc(quizAttempts.completedAt));

  return attempts as QuizAttempt[];
}

export async function getUserQuizStats(userId: string) {
  const attempts = await db
    .select({
      score: quizAttempts.score,
      percentage: quizAttempts.percentage,
      completedAt: quizAttempts.completedAt,
    })
    .from(quizAttempts)
    .where(eq(quizAttempts.userId, userId))
    .orderBy(desc(quizAttempts.completedAt));

  return attempts;
}

export async function getAttemptDetails(attemptId: string) {
  const attempt = await db
    .select()
    .from(quizAttempts)
    .where(eq(quizAttempts.id, attemptId))
    .limit(1);

  if (!attempt.length) return null;

  const answers = await db
    .select()
    .from(quizAttemptAnswers)
    .where(eq(quizAttemptAnswers.attemptId, attemptId));

  return {
    attempt: attempt[0],
    answers,
  };
}

export interface UserQuizProgress {
  quizId: string;
  bestScore: number;
  totalQuestions: number;
  attemptsCount: number;
  lastAttemptAt: Date;
}

export async function getUserQuizzesProgress(
  userId: string
): Promise<Map<string, UserQuizProgress>> {
  const results = await db
    .select({
      quizId: quizAttempts.quizId,
      score: quizAttempts.score,
      totalQuestions: quizAttempts.totalQuestions,
      completedAt: quizAttempts.completedAt,
    })
    .from(quizAttempts)
    .where(eq(quizAttempts.userId, userId))
    .orderBy(desc(quizAttempts.completedAt));

  const progressMap = new Map<string, UserQuizProgress>();

  for (const row of results) {
    const existing = progressMap.get(row.quizId);

    if (!existing) {
      progressMap.set(row.quizId, {
        quizId: row.quizId,
        bestScore: row.score,
        totalQuestions: row.totalQuestions,
        attemptsCount: 1,
        lastAttemptAt: row.completedAt,
      });
    } else {
      existing.attemptsCount += 1;
      if (row.score > existing.bestScore) {
        existing.bestScore = row.score;
      }
    }
  }

  return progressMap;
}

export async function getUserLastAttemptPerQuiz(
  userId: string,
  locale: string = 'uk'
): Promise<UserLastAttempt[]> {
  const rows = await db.execute(sql`
    SELECT DISTINCT ON (qa.quiz_id)
      qa.id AS "attemptId",
      qa.quiz_id AS "quizId",
      q.slug AS "quizSlug",
      qt.title AS "quizTitle",
      c.slug AS "categorySlug",
      ct.title AS "categoryName",
      qa.score,
      qa.total_questions AS "totalQuestions",
      qa.percentage,
      COALESCE(pt_sum.total, 0)::int AS "pointsEarned",
      qa.integrity_score AS "integrityScore",
      qa.completed_at AS "completedAt"
    FROM quiz_attempts qa
    JOIN quizzes q ON q.id = qa.quiz_id
    LEFT JOIN quiz_translations qt ON qt.quiz_id = q.id AND qt.locale = ${locale}
    LEFT JOIN categories c ON c.id = q.category_id
    LEFT JOIN category_translations ct ON ct.category_id = c.id AND ct.locale = ${locale}
    LEFT JOIN (
      SELECT (metadata->>'quizId')::uuid AS quiz_id, SUM(points) AS total
      FROM point_transactions
      WHERE user_id = ${userId} AND source = 'quiz'
      GROUP BY (metadata->>'quizId')::uuid
    ) pt_sum ON pt_sum.quiz_id = qa.quiz_id
    WHERE qa.user_id = ${userId}
    ORDER BY qa.quiz_id, qa.completed_at DESC
  `);

  const attempts = (rows as { rows: unknown[] }).rows as UserLastAttempt[];

  return attempts.sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );
}

export async function getAttemptReviewDetails(
  attemptId: string,
  userId: string,
  locale: string = 'uk'
): Promise<AttemptReview | null> {
  const cached = await getCachedAttemptReview(attemptId, userId, locale);
  if (cached) return cached;

  const attemptRow = await db
    .select({
      id: quizAttempts.id,
      quizId: quizAttempts.quizId,
      score: quizAttempts.score,
      totalQuestions: quizAttempts.totalQuestions,
      percentage: quizAttempts.percentage,
      pointsEarned: quizAttempts.pointsEarned,
      integrityScore: quizAttempts.integrityScore,
      completedAt: quizAttempts.completedAt,
      quizSlug: quizzes.slug,
      quizTitle: quizTranslations.title,
      categorySlug: categories.slug,
    })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
    .leftJoin(
      quizTranslations,
      and(
        eq(quizTranslations.quizId, quizzes.id),
        eq(quizTranslations.locale, locale)
      )
    )
    .leftJoin(categories, eq(categories.id, quizzes.categoryId))
    .where(and(eq(quizAttempts.id, attemptId), eq(quizAttempts.userId, userId)))
    .limit(1);

  if (!attemptRow.length) return null;

  const attempt = attemptRow[0];

  const incorrectUserAnswers = await db
    .select({
      quizQuestionId: quizAttemptAnswers.quizQuestionId,
      selectedAnswerId: quizAttemptAnswers.selectedAnswerId,
    })
    .from(quizAttemptAnswers)
    .where(
      and(
        eq(quizAttemptAnswers.attemptId, attemptId),
        eq(quizAttemptAnswers.isCorrect, false)
      )
    );

  if (incorrectUserAnswers.length === 0) {
    const review: AttemptReview = {
      attemptId,
      quizTitle: attempt.quizTitle,
      quizSlug: attempt.quizSlug,
      categorySlug: attempt.categorySlug,
      score: attempt.score,
      totalQuestions: attempt.totalQuestions,
      percentage: attempt.percentage,
      pointsEarned: attempt.pointsEarned,
      integrityScore: attempt.integrityScore,
      completedAt: attempt.completedAt,
      incorrectQuestions: [],
    };
    await cacheAttemptReview(attemptId, userId, locale, review);
    return review;
  }

  const incorrectQuestionIds = incorrectUserAnswers.map(a => a.quizQuestionId);

  const questionsData = await db
    .select({
      id: quizQuestions.id,
      questionText: quizQuestionContent.questionText,
      explanation: quizQuestionContent.explanation,
    })
    .from(quizQuestions)
    .leftJoin(
      quizQuestionContent,
      and(
        eq(quizQuestionContent.quizQuestionId, quizQuestions.id),
        eq(quizQuestionContent.locale, locale)
      )
    )
    .where(inArray(quizQuestions.id, incorrectQuestionIds));

  const allAnswersForQuestions = await db
    .select({
      id: quizAnswers.id,
      questionId: quizAnswers.quizQuestionId,
      displayOrder: quizAnswers.displayOrder,
      isCorrect: quizAnswers.isCorrect,
      answerText: quizAnswerTranslations.answerText,
    })
    .from(quizAnswers)
    .leftJoin(
      quizAnswerTranslations,
      and(
        eq(quizAnswerTranslations.quizAnswerId, quizAnswers.id),
        eq(quizAnswerTranslations.locale, locale)
      )
    )
    .where(inArray(quizAnswers.quizQuestionId, incorrectQuestionIds))
    .orderBy(quizAnswers.displayOrder);

  const answersByQuestion = new Map<string, typeof allAnswersForQuestions>();
  for (const answer of allAnswersForQuestions) {
    const arr = answersByQuestion.get(answer.questionId) || [];
    arr.push(answer);
    answersByQuestion.set(answer.questionId, arr);
  }

  const selectedByQuestion = new Map<string, string | null>();
  for (const ua of incorrectUserAnswers) {
    selectedByQuestion.set(ua.quizQuestionId, ua.selectedAnswerId);
  }

  const incorrectQuestions: AttemptQuestionDetail[] = questionsData.map(q => {
    const selectedId = selectedByQuestion.get(q.id) ?? null;
    return {
      questionId: q.id,
      questionText: q.questionText,
      explanation: q.explanation,
      selectedAnswerId: selectedId,
      answers: (answersByQuestion.get(q.id) || []).map(a => ({
        id: a.id,
        answerText: a.answerText,
        isCorrect: a.isCorrect,
        isSelected: a.id === selectedId,
      })),
    };
  });

  const review: AttemptReview = {
    attemptId,
    quizTitle: attempt.quizTitle,
    quizSlug: attempt.quizSlug,
    categorySlug: attempt.categorySlug,
    score: attempt.score,
    totalQuestions: attempt.totalQuestions,
    percentage: attempt.percentage,
    pointsEarned: attempt.pointsEarned,
    integrityScore: attempt.integrityScore,
    completedAt: attempt.completedAt,
    incorrectQuestions,
  };

  await cacheAttemptReview(attemptId, userId, locale, review);
  return review;
}
