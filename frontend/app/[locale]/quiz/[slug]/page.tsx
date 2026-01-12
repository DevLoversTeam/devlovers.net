import { createEncryptedAnswersBlob } from '@/lib/quiz/quiz-crypto';
import { stripCorrectAnswers } from '@/db/queries/quiz';
import { getQuizBySlug, getQuizQuestionsRandomized } from '@/db/queries/quiz';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { QuizContainer } from '@/components/quiz/QuizContainer';
import { PendingResultHandler } from '@/components/quiz/PendingResultHandler';

import { getCurrentUser } from '@/lib/auth';

interface QuizPageProps {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{seed?: string}>;
}

export default async function QuizPage({ params, searchParams }: QuizPageProps) {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: 'quiz.page' });
  const { seed: seedParam } = await searchParams;

  const user = await getCurrentUser();

  const quiz = await getQuizBySlug(slug, locale);

  if (!quiz || !quiz.isActive) {
    notFound();
  }

  const seed = seedParam ? parseInt(seedParam, 10) : Date.now();
  const questions = await getQuizQuestionsRandomized(quiz.id, locale, seed);

  const encryptedAnswers = createEncryptedAnswersBlob(questions);
  const clientQuestions = stripCorrectAnswers(questions);

  if (!questions.length) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">{t('noQuestions')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="max-w-3xl mx-auto px-4 py-8">
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
            <span>{t('questionsLabel')}: {quiz.questionsCount}</span>
            <span>
              {t('timeLabel')}: {Math.floor((quiz.timeLimitSeconds ?? questions.length * 30) / 60)} {t('minutes')}
            </span>
          </div>
        </div>

        <QuizContainer
          quizSlug={slug}
          quizId={quiz.id}
          questions={clientQuestions}
          encryptedAnswers={encryptedAnswers}
          userId={user?.id ?? null}
          timeLimitSeconds={quiz.timeLimitSeconds ?? questions.length * 30}
          seed={seed}
          categorySlug={quiz.categorySlug} 
        />
        {user && <PendingResultHandler userId={user.id} />}
      </div>
    </div>
  );
}
