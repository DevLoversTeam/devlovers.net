import { getActiveQuizzes, getUserQuizzesProgress } from '@/db/queries/quiz';
import { getCurrentUser } from '@/lib/auth';
import QuizzesSection from '@/components/quiz/QuizzesSection';

type PageProps = { params: Promise<{ locale: string }> };

export const dynamic = 'force-dynamic';

export default async function QuizzesPage({ params }: PageProps) {
  const { locale } = await params;
  const session = await getCurrentUser();
  
  const quizzes = await getActiveQuizzes(locale);

  let userProgressMap: Record<string, any> = {};

  if (session?.id) {
    const progressMapData = await getUserQuizzesProgress(session.id);
    userProgressMap = Object.fromEntries(progressMapData);
  }

  if (!quizzes.length) {
    return (
      <div className="mx-auto max-w-5xl py-12">
        <h1 className="text-3xl font-bold mb-4">Quizzes</h1>
        <p className="text-gray-600 dark:text-gray-400">
          No quizzes available yet. Please check back soon.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl py-12">
      <div className="mb-8">
        <p className="text-sm text-blue-600 dark:text-blue-400 font-semibold">
          Practice
        </p>
        <h1 className="text-3xl font-bold">Quizzes</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Choose a quiz to test your knowledge.
        </p>
      </div>

      <QuizzesSection quizzes={quizzes} userProgressMap={userProgressMap} />
    </div>
  );
}
