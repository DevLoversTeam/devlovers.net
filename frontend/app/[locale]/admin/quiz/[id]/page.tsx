import { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { QuizEditorList } from '@/components/admin/quiz/QuizEditorList';
import { getAdminQuizFull } from '@/db/queries/quizzes/admin-quiz';
import { Link } from '@/i18n/routing';
import { issueCsrfToken } from '@/lib/security/csrf';

export const metadata: Metadata = {
  title: 'Edit Quiz | DevLovers',
};

export default async function AdminQuizEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const quiz = await getAdminQuizFull(id);

  if (!quiz) notFound();

  const title =
    quiz.translations.en?.title ?? quiz.translations.uk?.title ?? quiz.slug;

  const csrfToken = issueCsrfToken('admin:quiz:question:update');

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6">
        <Link
          href="/admin/quiz"
          className="text-muted-foreground hover:text-foreground text-sm transition-colors"
        >
          &larr; Back to quizzes
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-foreground text-2xl font-bold">{title}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {quiz.questions.length} questions &middot; slug: {quiz.slug}
        </p>
      </div>

      <QuizEditorList
        questions={quiz.questions}
        quizId={quiz.id}
        csrfToken={csrfToken}
      />
    </div>
  );
}
