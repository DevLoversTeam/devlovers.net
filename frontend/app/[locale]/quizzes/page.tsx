import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import QuizzesSection from '@/components/quiz/QuizzesSection';
import { DynamicGridBackground } from '@/components/ui/dynamic-grid-background';
import { getActiveQuizzes } from '@/db/queries/quizzes/quiz';
import { getLocalizedMetadata } from '@/i18n/metadata';

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  return getLocalizedMetadata('quiz.list', locale);
}

export const revalidate = 300;

export default async function QuizzesPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'quiz.list' });
  const tNavigation = await getTranslations({ locale, namespace: 'navigation' });
  const title = tNavigation('quizzes');

  const quizzes = await getActiveQuizzes(locale);

  if (!quizzes.length) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="mb-4 text-3xl font-bold">{title}</h1>
        <p className="text-gray-600 dark:text-gray-400">{t('noQuizzes')}</p>
      </div>
    );
  }

  return (
    <DynamicGridBackground className="min-h-screen bg-gray-50 py-10 transition-colors duration-300 dark:bg-transparent">
      <section className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <p className="text-sm font-semibold text-(--accent-primary)">
            {t('practice')}
          </p>
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="text-gray-600 dark:text-gray-400">{t('subtitle')}</p>
        </div>

        <QuizzesSection quizzes={quizzes} userProgressMap={{}} />
      </section>
    </DynamicGridBackground>
  );
}
