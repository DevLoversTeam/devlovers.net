import { NextRequest, NextResponse } from 'next/server';

import { getQuizQuestionsRandomized } from '@/db/queries/quiz';
import { createQuizAnswersSession } from '@/lib/quiz/quiz-answers-redis';

interface StartRequest {
  quizId: string;
  locale: string;
  seed: number;
  timeLimitSeconds: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: StartRequest = await request.json();
    const { quizId, locale, seed, timeLimitSeconds } = body;

    if (!quizId || !locale || !seed || !timeLimitSeconds) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const questions = await getQuizQuestionsRandomized(quizId, locale, seed);
    const sessionId = await createQuizAnswersSession(
      quizId,
      questions,
      timeLimitSeconds
    );

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Failed to create session' },
        { status: 500 }
      );
    }

    return NextResponse.json({ sessionId });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
