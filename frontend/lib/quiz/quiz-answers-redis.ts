import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { quizAnswers, quizQuestions } from '@/db/schema/quiz';
import { getRedisClient } from '@/lib/redis';

const QUIZ_CACHE_TTL_SECONDS = 60 * 60 * 12;

interface QuizAnswersCache {
  quizId: string;
  answers: Record<string, string>; // questionId - correctAnswerId
  cachedAt: number;
}

function getCacheKey(quizId: string): string {
  return `quiz:answers:${quizId}`;
}

export async function getOrCreateQuizAnswersCache(
  quizId: string
): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) {
    console.warn('Redis not configured, skipping cache');
    return true; // Allow quiz to proceed without cache
  }

  const key = getCacheKey(quizId);

  // Check if cache exists
  const existing = await redis.get<QuizAnswersCache>(key);
  if (existing) {
    return true; // Cache hit
  }

  // Fetch correct answers from DB
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

  await redis.set(key, cacheData, { ex: QUIZ_CACHE_TTL_SECONDS });
  return true;
}

export async function getCorrectAnswer(
  quizId: string,
  questionId: string
): Promise<string | null> {
  const redis = getRedisClient();
  if (!redis) {
    return null;
  }

  const key = getCacheKey(quizId);
  const cache = await redis.get<QuizAnswersCache>(key);

  if (!cache) {
    return null;
  }

  return cache.answers[questionId] ?? null;
}
