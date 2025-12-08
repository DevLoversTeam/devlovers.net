import { NextRequest, NextResponse } from 'next/server';
import { getQuizBySlug, getQuizQuestionsRandomized } from '@/db/queries/quiz';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const locale = request.nextUrl.searchParams.get('locale') || 'uk';

  try {
    const quiz = await getQuizBySlug(slug, locale);

    if (!quiz) {
      return NextResponse.json({ error: 'Quiz not found' }, { status: 404 });
    }

    const questions = await getQuizQuestionsRandomized(quiz.id, locale);

    const formattedQuestions = questions.map((q, index) => ({
      id: q.id,
      number: index + 1,
      text: q.questionText,
      difficulty: q.difficulty,
      answers: q.answers.map(a => ({
        id: a.id,
        text: a.answerText,
        isCorrect: a.isCorrect,
      })),
      explanation: q.explanation,
    }));

    return NextResponse.json({
      quiz: {
        id: quiz.id,
        slug: quiz.slug,
        title: quiz.title,
        description: quiz.description,
        questionsCount: quiz.questionsCount,
        timeLimitSeconds: quiz.timeLimitSeconds,
      },
      questions: formattedQuestions,
    });
  } catch (error) {
    console.error('Error fetching quiz:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
