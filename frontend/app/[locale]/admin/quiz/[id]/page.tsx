import { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { QuizEditorList } from '@/components/admin/quiz/QuizEditorList';
import { UploadMoreQuestions } from '@/components/admin/quiz/UploadMoreQuestions';
import { QuizStatusControls } from '@/components/admin/quiz/QuizStatusControls';
import { QuizMetadataEditor } from '@/components/admin/quiz/QuizMetadataEditor';
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

  const isDraft = quiz.status === 'draft';

  const csrfToken = issueCsrfToken('admin:quiz:question:update');
  const csrfTokenDelete = isDraft
    ? issueCsrfToken('admin:quiz:question:delete')
    : undefined;
  const csrfTokenAddQuestions = isDraft
    ? issueCsrfToken('admin:quiz:questions:add')
    : undefined;
  const csrfTokenUpdate = issueCsrfToken('admin:quiz:update');


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
        <div className="mt-1 flex items-center gap-3">
          <span className="text-muted-foreground text-sm">
            {quiz.questions.length} questions &middot; slug: {quiz.slug}
          </span>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              isDraft
                ? 'bg-amber-500/10 text-amber-500'
                : 'bg-emerald-500/10 text-emerald-500'
            }`}
          >
            {isDraft ? 'Draft' : 'Ready'}
          </span>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              quiz.isActive
                ? 'bg-emerald-500/10 text-emerald-500'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {quiz.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>
      <div className="mb-6">
        <QuizStatusControls
          quizId={quiz.id}
          status={quiz.status}
          isActive={quiz.isActive}
          csrfToken={csrfTokenUpdate}
        />
      </div>
            <div className="mb-6">
        <QuizMetadataEditor
          quizId={quiz.id}
          translations={quiz.translations}
          timeLimitSeconds={quiz.timeLimitSeconds}
          csrfToken={csrfTokenUpdate}
        />
      </div>

      {isDraft && csrfTokenAddQuestions && (
        <div className="mb-6">
          <UploadMoreQuestions
            quizId={quiz.id}
            csrfToken={csrfTokenAddQuestions}
          />
        </div>
      )}

      <QuizEditorList
        questions={quiz.questions}
        quizId={quiz.id}
        csrfToken={csrfToken}
        csrfTokenDelete={csrfTokenDelete}
        isDraft={isDraft}
      />
    </div>
  );
}
