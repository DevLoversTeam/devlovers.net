import { ArrowLeft, CheckCircle, RotateCcw, SearchX } from 'lucide-react';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';

import { QuizReviewList } from '@/components/dashboard/QuizReviewList';
import { DynamicGridBackground } from '@/components/shared/DynamicGridBackground';
import { categoryTabStyles } from '@/data/categoryStyles';
import { getAttemptReviewDetails } from '@/db/queries/quizzes/quiz';
import { Link, redirect } from '@/i18n/routing';
import { getCurrentUser } from '@/lib/auth';
import { cn } from '@/lib/utils';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'dashboard.quizReview' });

  return {
    title: t('title'),
  };
}

export default async function QuizReviewPage({
  params,
}: {
  params: Promise<{ locale: string; attemptId: string }>;
}) {
  const session = await getCurrentUser();
  const { locale, attemptId } = await params;

  if (!session) {
    redirect({ href: '/login', locale });
    return;
  }

  const t = await getTranslations('dashboard.quizReview');
  const tNav = await getTranslations('navigation');
  const review = await getAttemptReviewDetails(attemptId, session.id, locale);

  const cardStyles =
    'relative overflow-hidden rounded-2xl border border-gray-100 dark:border-white/5 bg-white/60 dark:bg-neutral-900/60 backdrop-blur-xl p-6 sm:p-8';

  const btnOutline =
    'inline-flex items-center gap-2 rounded-full border border-gray-200 dark:border-white/10 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm px-6 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 transition-colors hover:bg-white hover:text-[var(--accent-primary)] dark:hover:bg-neutral-800 dark:hover:text-[var(--accent-primary)]';

  const btnPrimary =
    'inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold text-white bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] transition-all hover:scale-105';

  // Not found / not owned
  if (!review) {
    return (
      <DynamicGridBackground className="min-h-screen bg-gray-50 py-10 dark:bg-transparent">
        <main className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6">
          <div className={`${cardStyles} text-center`}>
            <SearchX className="mx-auto mb-4 h-10 w-10 text-gray-400" />
            <h2 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">
              {t('notFound')}
            </h2>
            <Link href="/dashboard" className={btnOutline}>
              <ArrowLeft className="h-4 w-4" />
              {t('backToDashboard')}
            </Link>
          </div>
        </main>
      </DynamicGridBackground>
    );
  }
  const slug = review.categorySlug;
  const categoryStyle =
    slug && slug in categoryTabStyles
      ? categoryTabStyles[slug as keyof typeof categoryTabStyles]
      : null;

  const incorrectCount = review.incorrectQuestions.length;

  // All correct
  if (incorrectCount === 0) {
    return (
      <DynamicGridBackground className="min-h-screen bg-gray-50 py-10 dark:bg-transparent">
        <main className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6">
          <div className={`${cardStyles} text-center`}>
            <CheckCircle className="mx-auto mb-4 h-10 w-10 text-emerald-500" />
            <h2 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">
              {t('allCorrect')}
            </h2>
            <p className="mb-6 text-gray-500 dark:text-gray-400">
              {t('allCorrectHint')}
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link href="/dashboard" className={btnOutline}>
                <ArrowLeft className="h-4 w-4" />
                {t('backToDashboard')}
              </Link>
              <Link href={`/quiz/${review.quizSlug}`} className={btnPrimary}>
                <RotateCcw className="h-4 w-4" />
                {t('retakeQuiz')}
              </Link>
            </div>
          </div>
        </main>
      </DynamicGridBackground>
    );
  }

  // Main review
  return (
    <DynamicGridBackground className="min-h-screen bg-gray-50 py-10 dark:bg-transparent">
      <main className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6">
        <nav className="mb-4" aria-label="Breadcrumb">
          <ol className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <li className="flex items-center gap-2">
              <Link href="/dashboard" className="underline-offset-4 transition hover:text-[var(--accent-primary)] hover:underline">
                {tNav('dashboard')}
              </Link>
              <span>&gt;</span>
            </li>
            <li>
              <span className="text-[var(--accent-primary)]" aria-current="page">
                {review.quizTitle ?? review.quizSlug}
              </span>
            </li>
          </ol>
        </nav>
        <header className="mb-8">
          <div className="flex items-center gap-3">
          {categoryStyle && (
            <span className="relative h-8 w-8 shrink-0 sm:h-10 sm:w-10">
              <Image
                src={categoryStyle.icon}
                alt=""
                fill
                className={cn('object-contain', 'iconClassName' in categoryStyle && categoryStyle.iconClassName)}
              />
            </span>
          )}
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              {review.quizTitle ?? review.quizSlug}
            </h1>
          </div>
          <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">
            {t('title')} &mdash;{' '}
            {t('subtitle', {
              incorrect: incorrectCount,
              total: review.totalQuestions,
            })}
          </p>
        </header>
          <QuizReviewList
            questions={review.incorrectQuestions}
            accentColor={categoryStyle?.accent}
          />
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link href="/dashboard" className={btnOutline}>
            <ArrowLeft className="h-4 w-4" />
            {t('backToDashboard')}
          </Link>
          <Link href={`/quiz/${review.quizSlug}`} className={btnPrimary}>
            <RotateCcw className="h-4 w-4" />
            {t('retakeQuiz')}
          </Link>
        </div>
      </main>
    </DynamicGridBackground>
  );
}
