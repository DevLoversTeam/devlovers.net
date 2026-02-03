import { NextRequest, NextResponse } from 'next/server';

import { decryptAnswers } from '@/lib/quiz/quiz-crypto';

interface VerifyRequest {
  questionId: string;
  answerId: string;
  encryptedAnswers: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: VerifyRequest = await request.json();
    const { questionId, answerId, encryptedAnswers } = body;

    if (!questionId || !answerId || !encryptedAnswers) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const correctAnswersMap = decryptAnswers(encryptedAnswers);

    if (!correctAnswersMap) {
      return NextResponse.json(
        { error: 'Invalid encrypted data' },
        { status: 400 }
      );
    }

    const correctAnswerId = correctAnswersMap[questionId];

    if (!correctAnswerId) {
      return NextResponse.json(
        { error: 'Question not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      isCorrect: answerId === correctAnswerId,
    });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
