import { getTranslations } from 'next-intl/server';

import QuizzesSection from '@/components/quiz/QuizzesSection';
import { DynamicGridBackground } from '@/components/shared/DynamicGridBackground';
import { getActiveQuizzes, getUserQuizzesProgress } from '@/db/queries/quiz';
import { getCurrentUser } from '@/lib/auth';

type PageProps = { params: Promise<{ locale: string }> };

export const dynamic = 'force-dynamic';

export default async function QuizzesPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'quiz.list' });
  const session = await getCurrentUser();

  const quizzes = await getActiveQuizzes(locale);

  let userProgressMap: Record<string, any> = {};

  if (session?.id) {
    const progressMapData = await getUserQuizzesProgress(session.id);
    userProgressMap = Object.fromEntries(progressMapData);
  }

  if (!quizzes.length) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="mb-4 text-3xl font-bold">{t('title')}</h1>
        <p className="text-gray-600 dark:text-gray-400">{t('noQuizzes')}</p>
      </div>
    );
  }

  return (
    <DynamicGridBackground className="min-h-screen bg-gray-50 py-10 transition-colors duration-300 dark:bg-transparent">
      <main className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <p className="text-sm font-semibold text-[var(--accent-primary)]">
            {t('practice')}
          </p>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-gray-600 dark:text-gray-400">{t('subtitle')}</p>
        </div>

        <QuizzesSection quizzes={quizzes} userProgressMap={userProgressMap} />
      </main>
    </DynamicGridBackground>
  );
}
