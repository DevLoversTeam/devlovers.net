import { NextResponse } from "next/server";
import { db } from "@/db";
import { quizAttempts, quizAttemptAnswers } from "@/db/schema/quiz";
import { awardQuizPoints } from "@/db/queries/points";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  if (!body) {
    return NextResponse.json(
      { success: false, error: "Invalid input" },
      { status: 400 }
    );
  }

  const { userId, quizId, answers, violations, timeSpentSeconds } = body;

  if (!userId || !quizId || !Array.isArray(answers) || answers.length === 0) {
    return NextResponse.json(
      { success: false, error: "Invalid input" },
      { status: 400 }
    );
  }

  try {
    const correctAnswersCount = answers.filter((a: { isCorrect: boolean }) => a.isCorrect).length;
    const totalQuestions = answers.length;
    const percentage = ((correctAnswersCount / totalQuestions) * 100).toFixed(2);
    const integrityScore = Math.max(
      0,
      100 - (Array.isArray(violations) ? violations.length : 0) * 10
    );

    const now = new Date();
    const startedAt = new Date(now.getTime() - Number(timeSpentSeconds || 0) * 1000);

    const [attempt] = await db
      .insert(quizAttempts)
      .values({
        userId,
        quizId,
        score: correctAnswersCount,
        totalQuestions,
        percentage,
        timeSpentSeconds,
        integrityScore,
        metadata: { violations: violations || [], isGuestResult: true },
        startedAt,
        completedAt: now,
      })
      .returning({ id: quizAttempts.id });

    await db.insert(quizAttemptAnswers).values(
      answers.map((a: { questionId: string; selectedAnswerId: string; isCorrect: boolean }) => ({
        attemptId: attempt.id,
        quizQuestionId: a.questionId,
        selectedAnswerId: a.selectedAnswerId,
        isCorrect: a.isCorrect,
        answeredAt: now,
      }))
    );

    const pointsAwarded = await awardQuizPoints({
      userId,
      quizId,
      attemptId: attempt.id,
      score: correctAnswersCount,
      integrityScore,
    });

    return NextResponse.json({
      success: true,
      attemptId: attempt.id,
      score: correctAnswersCount,
      totalQuestions,
      percentage: parseFloat(percentage),
      integrityScore,
      pointsAwarded,
    });
  } catch (error) {
    console.error('Failed to save guest quiz result:', error);
    return NextResponse.json(
      { success: false, error: "Failed to save result" },
      { status: 500 }
    );
  }
}
