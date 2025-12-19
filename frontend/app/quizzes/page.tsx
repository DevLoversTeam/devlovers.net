import Link from 'next/link';
import { getActiveQuizzes } from '@/db/queries/quiz';

type PageProps = { searchParams: Promise<{ locale?: string }>; };


export const dynamic = 'force-dynamic';

export default async function QuizzesPage({ searchParams }: PageProps) {
  const { locale = 'uk' } = await searchParams;
  const quizzes = await getActiveQuizzes(locale);

  if (!quizzes.length) {
    return (
      <div className="mx-auto max-w-4xl py-12">
        <h1 className="text-3xl font-bold mb-4">Quizzes</h1>
        <p className="text-gray-600 dark:text-gray-400">
          No quizzes available yet. Please check back soon.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl py-12">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-blue-600 dark:text-blue-400 font-semibold">
            Practice
          </p>
          <h1 className="text-3xl font-bold">Quizzes</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Choose a quiz to test your knowledge.
          </p>
        </div>
      </div>

      <div className="grid gap-4">
        {quizzes.map((quiz) => (
          <div
            key={quiz.id}
            className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold">
                  {quiz.title ?? quiz.slug}
                </h2>
                {quiz.description && (
                  <p className="text-gray-600 dark:text-gray-400 text-sm">
                    {quiz.description}
                  </p>
                )}
                <div className="flex gap-3 text-xs text-gray-500">
                  <span>{quiz.questionsCount} questions</span>
                  {quiz.timeLimitSeconds && (
                    <span>
                      {Math.floor(quiz.timeLimitSeconds / 60)} min limit
                    </span>
                  )}
                </div>
              </div>
              <Link
                href={`/quiz/${quiz.slug}`}
                className="inline-flex items-center rounded-lg bg-blue-600 text-white px-3 py-2 text-sm font-medium hover:bg-blue-500 transition"
              >
                Start quiz
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
