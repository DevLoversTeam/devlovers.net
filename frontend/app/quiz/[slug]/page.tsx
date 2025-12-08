import { getQuizBySlug, getQuizQuestionsRandomized } from '@/db/queries/quiz';
  import { notFound } from 'next/navigation';
  import { QuizContainer } from '@/components/quiz/QuizContainer';

  interface QuizPageProps {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ locale?: string }>;
  }

  export default async function QuizPage({ params, searchParams }: QuizPageProps) {
    const { slug } = await params;
    const { locale = 'uk' } = await searchParams;

    // Fetch quiz data
    const quiz = await getQuizBySlug(slug, locale);

    if (!quiz || !quiz.isActive) {
      notFound();
    }

    // Fetch questions with randomized order
    const questions = await getQuizQuestionsRandomized(quiz.id, locale);

    if (!questions.length) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-gray-600">Немає питань для цього квізу</p>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-white dark:bg-black">
        <div className="max-w-3xl mx-auto px-4 py-8">
          {/* Quiz header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              {quiz.title}
            </h1>
            {quiz.description && (
              <p className="text-gray-600 dark:text-gray-400">
                {quiz.description}
              </p>
            )}
            <div className="mt-4 flex gap-4 text-sm text-gray-500">
              <span>Питань: {quiz.questionsCount}</span>
              {quiz.timeLimitSeconds && (
                <span>Час: {Math.floor(quiz.timeLimitSeconds / 60)} хв</span>
              )}
            </div>
          </div>

          {/* Quiz container with all questions */}
          <QuizContainer
            quizId={quiz.id}
            questions={questions}
            userId="test-user-123"

          />
        </div>
      </div>
    );
  }