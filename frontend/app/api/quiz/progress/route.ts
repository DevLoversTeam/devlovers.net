import { NextResponse } from 'next/server';

import { getUserQuizzesProgress } from '@/db/queries/quizzes/quiz';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getCurrentUser();

  if (!user?.id) {
    return NextResponse.json(
      {},
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }

  const rawProgress = await getUserQuizzesProgress(user.id);
  const progressMap: Record<
    string,
    { bestScore: number; totalQuestions: number; attemptsCount: number }
  > = {};

  for (const [quizId, progress] of rawProgress) {
    progressMap[quizId] = {
      bestScore: progress.bestScore,
      totalQuestions: progress.totalQuestions,
      attemptsCount: progress.attemptsCount,
    };
  }

  return NextResponse.json(progressMap, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
