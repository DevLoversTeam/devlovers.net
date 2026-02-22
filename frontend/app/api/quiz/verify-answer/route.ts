import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  getCorrectAnswer,
  getOrCreateQuizAnswersCache,
  isQuestionAlreadyVerified,
  markQuestionVerified,
} from '@/lib/quiz/quiz-answers-redis';
import { resolveRequestIdentifier } from '@/lib/quiz/resolve-identifier';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    if (!body?.quizId || !body?.questionId || !body?.selectedAnswerId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const { quizId, questionId, selectedAnswerId, timeLimitSeconds } = body;

    // Identify user: userId for authenticated, IP for guests
    const headersList = await headers();
    const identifier = resolveRequestIdentifier(headersList);
    if (identifier) {
      const alreadyVerified = await isQuestionAlreadyVerified(
        quizId,
        questionId,
        identifier
      );
      if (alreadyVerified) {
        return NextResponse.json(
          { success: false, error: 'Question already answered' },
          { status: 409 }
        );
      }
    }

    let correctAnswerId = await getCorrectAnswer(quizId, questionId);

    if (!correctAnswerId) {
      const cacheReady = await getOrCreateQuizAnswersCache(quizId);
      if (cacheReady) {
        correctAnswerId = await getCorrectAnswer(quizId, questionId);
      }
    }

    if (!correctAnswerId) {
      return NextResponse.json(
        { success: false, error: 'Question not found in cache' },
        { status: 404 }
      );
    }

    const MAX_TTL = 3600;
    const ttl =
      typeof timeLimitSeconds === 'number' && timeLimitSeconds > 0
        ? Math.min(timeLimitSeconds + 60, MAX_TTL)
        : 900;

    if (identifier) {
      await markQuestionVerified(quizId, questionId, identifier, ttl);
    }
    const isCorrect = selectedAnswerId === correctAnswerId;

    return NextResponse.json({
      success: true,
      isCorrect,
    });
  } catch (error) {
    console.error('Failed to verify answer:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
