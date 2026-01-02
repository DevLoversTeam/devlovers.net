import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { db } from '../index';
import {
  quizzes,
  quizTranslations,
  quizQuestions,
  quizQuestionContent,
  quizAnswers,
  quizAnswerTranslations,
  quizAttempts,
  quizAttemptAnswers,
} from '../schema/quiz';
import { categories, categoryTranslations } from '../schema/categories';
import { eq, and, desc, sql } from 'drizzle-orm';

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

export interface QuizQuestion {
  id: string;
  displayOrder: number;
  difficulty: string | null;
  questionText: string | null;
  explanation: any;
}

export interface QuizAnswer {
  id: string;
  displayOrder: number;
  isCorrect: boolean;
  answerText: string | null;
}

export interface QuizQuestionWithAnswers extends QuizQuestion {
  answers: QuizAnswer[];
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

const getQuizBySlugCached = unstable_cache(
  async (slug: string, locale: string = 'uk'): Promise<Quiz | null> => {
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
  ['quiz-by-slug'],
  { revalidate: 300 }
);

export const getQuizBySlug = cache(
  async (slug: string, locale: string = 'uk'): Promise<Quiz | null> => {
    return getQuizBySlugCached(slug, locale);
  }
);

const getActiveQuizzesCached = unstable_cache(
  async (locale: string = 'uk'): Promise<Quiz[]> => {
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
      .where(eq(quizzes.isActive, true))
      .orderBy(categories.displayOrder, quizzes.displayOrder);

    return rows;
  },
  ['active-quizzes'],
  { revalidate: 300 }
);

export const getActiveQuizzes = cache(
  async (locale: string = 'uk'): Promise<Quiz[]> => {
    return getActiveQuizzesCached(locale);
  }
);

export async function getQuizQuestions(
  quizId: string,
  locale: string = 'uk'
): Promise<QuizQuestionWithAnswers[]> {
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

  const questions = await Promise.all(
    questionsData.map(async question => {
      const answersData = await db
        .select({
          id: quizAnswers.id,
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
        .where(eq(quizAnswers.quizQuestionId, question.id))
        .orderBy(quizAnswers.displayOrder);

      return {
        ...question,
        answers: answersData,
      };
    })
  );

  return questions;
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
