import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import {
  quizAnswers,
  quizAnswerTranslations,
  quizQuestionContent,
  quizQuestions,
} from '@/db/schema/quiz';
import { getRedisClient } from '@/lib/redis';
import type { QuizQuestionWithAnswers, AttemptReview } from '@/types/quiz';

interface QuizAnswersCache {
  quizId: string;
  answers: Record<string, string>;
  cachedAt: number;
}

interface QuizQuestionsCache {
  quizId: string;
  locale: string;
  questions: QuizQuestionWithAnswers[];
  cachedAt: number;
}

function getQuestionsCacheKey(quizId: string, locale: string): string {
  return `quiz:questions:${quizId}:${locale}`;
}

function getAnswersCacheKey(quizId: string): string {
  return `quiz:answers:${quizId}`;
}

export async function getOrCreateQuizAnswersCache(
  quizId: string
): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) {
    console.warn('Redis not configured, skipping cache');
    return true;
  }

  const key = getAnswersCacheKey(quizId);

  try {
    const existing = await redis.get<QuizAnswersCache>(key);
    if (existing) {
      return true;
    }
  } catch (err) {
    console.warn('Redis cache read failed:', err);
  }

  const correctAnswers = await db
    .select({
      questionId: quizQuestions.id,
      answerId: quizAnswers.id,
    })
    .from(quizAnswers)
    .innerJoin(quizQuestions, eq(quizAnswers.quizQuestionId, quizQuestions.id))
    .where(
      and(eq(quizQuestions.quizId, quizId), eq(quizAnswers.isCorrect, true))
    );

  if (correctAnswers.length === 0) {
    return false;
  }

  const answersMap: Record<string, string> = {};
  for (const row of correctAnswers) {
    answersMap[row.questionId] = row.answerId;
  }

  const cacheData: QuizAnswersCache = {
    quizId,
    answers: answersMap,
    cachedAt: Date.now(),
  };

  try {
    await redis.set(key, cacheData);
  } catch (err) {
    console.warn('Failed to cache quiz answers in Redis', err);
  }
  return true;
}

export async function getCorrectAnswer(
  quizId: string,
  questionId: string
): Promise<string | null> {
  const redis = getRedisClient();

  if (redis) {
    try {
      const key = getAnswersCacheKey(quizId);
      const cache = await redis.get<QuizAnswersCache>(key);
      if (cache) {
        return cache.answers[questionId] ?? null;
      }
    } catch (err) {
      console.warn('Redis cache read failed, falling back to DB:', err);
    }
  }

  const result = await db
    .select({ answerId: quizAnswers.id })
    .from(quizAnswers)
    .innerJoin(quizQuestions, eq(quizAnswers.quizQuestionId, quizQuestions.id))
    .where(
      and(
        eq(quizQuestions.quizId, quizId),
        eq(quizQuestions.id, questionId),
        eq(quizAnswers.isCorrect, true)
      )
    )
    .limit(1);

  return result[0]?.answerId ?? null;
}

export async function getOrCreateQuestionsCache(
  quizId: string,
  locale: string
): Promise<QuizQuestionWithAnswers[] | null> {
  const redis = getRedisClient();
  if (!redis) {
    return null;
  }

  const key = getQuestionsCacheKey(quizId, locale);

  try {
    const existing = await redis.get<QuizQuestionsCache>(key);
    if (existing) {
      return existing.questions;
    }
  } catch (err) {
    console.warn('Redis cache read failed, falling back to DB:', err);
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

  if (questionsData.length === 0) {
    const cacheData: QuizQuestionsCache = {
      quizId,
      locale,
      questions: [],
      cachedAt: Date.now(),
    };
    try {
      await redis.set(key, cacheData);
    } catch (e) {
      console.warn('Redis cache write failed:', e);
    }
    return [];
  }

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
    const arr = answersByQuestion.get(answer.questionId) || [];
    arr.push(answer);
    answersByQuestion.set(answer.questionId, arr);
  }

  const questions: QuizQuestionWithAnswers[] = questionsData.map(q => ({
    ...q,
    answers: (answersByQuestion.get(q.id) || []).map(a => ({
      id: a.id,
      displayOrder: a.displayOrder,
      isCorrect: a.isCorrect,
      answerText: a.answerText,
    })),
  }));

  const cacheData: QuizQuestionsCache = {
    quizId,
    locale,
    questions,
    cachedAt: Date.now(),
  };

  try {
    await redis.set(key, cacheData);
  } catch (e) {
    console.warn('Redis cache write failed:', e);
  }

  return questions;
}

export async function isQuestionAlreadyVerified(
  quizId: string,
  questionId: string,
  clientIp: string
): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return false;

  const key = `quiz:verified:${quizId}:${clientIp}:${questionId}`;
  try {
    const exists = await redis.get(key);
    return exists !== null;
  } catch {
    return false;
  }
}

export async function markQuestionVerified(
  quizId: string,
  questionId: string,
  clientIp: string,
  ttlSeconds: number = 900
): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  const key = `quiz:verified:${quizId}:${clientIp}:${questionId}`;
  try {
    await redis.set(key, 1, { ex: ttlSeconds });
  } catch {
    // silent fail — verification still works without tracking
  }
}
export async function clearVerifiedQuestions(
  quizId: string,
  identifier: string
): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  const pattern = `quiz:verified:${quizId}:${identifier}:*`;
  try {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, {
        match: pattern,
        count: 100,
      });
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== '0');
  } catch (err) {
    console.warn('Failed to clear verified questions:', err);
  }
}

const ATTEMPT_REVIEW_TTL = 48 * 60 * 60; // 48 hours

function getAttemptReviewCacheKey(
  attemptId: string,
  userId: string | undefined,
  locale: string
): string {
  return `quiz:attempt-review:${attemptId}:${userId}:${locale}`;
}

export async function getCachedAttemptReview(
  attemptId: string,
  userId: string | undefined,
  locale: string
): Promise<AttemptReview | null> {
  const redis = getRedisClient();
  if (!redis) return null;

  try {
    return await redis.get<AttemptReview>(
      getAttemptReviewCacheKey(attemptId, userId, locale)
    );
  } catch (err) {
    console.warn('Redis attempt review cache read failed:', err);
    return null;
  }
}

export async function cacheAttemptReview(
  attemptId: string,
  userId: string | undefined,
  locale: string,
  data: AttemptReview
): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    await redis.set(getAttemptReviewCacheKey(attemptId, userId, locale), data, {
      ex: ATTEMPT_REVIEW_TTL,
    });
  } catch (err) {
    console.warn('Redis attempt review cache write failed:', err);
  }
}

export async function invalidateQuizCache(quizId: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    await Promise.all([
      redis.del(`quiz:answers:${quizId}`),
      redis.del(`quiz:questions:${quizId}:en`),
      redis.del(`quiz:questions:${quizId}:uk`),
      redis.del(`quiz:questions:${quizId}:pl`),
    ]);
  } catch (err) {
    console.warn('Failed to invalidate quiz cache:', err);
  }
}
