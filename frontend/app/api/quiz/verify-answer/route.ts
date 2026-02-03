import { NextResponse } from 'next/server';

import { getCorrectAnswer, getOrCreateQuizAnswersCache } from '@/lib/quiz/quiz-answers-redis';

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

    const { quizId, questionId, selectedAnswerId } = body;

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
