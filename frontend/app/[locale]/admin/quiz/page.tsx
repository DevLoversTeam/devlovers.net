import { Metadata } from 'next';

import { QuizListTable } from '@/components/admin/quiz/QuizListTable';
import { getAdminQuizList } from '@/db/queries/quizzes/admin-quiz';
import { Link } from '@/i18n/routing';
import { issueCsrfToken } from '@/lib/security/csrf';

export const metadata: Metadata = {
  title: 'Quiz Admin | DevLovers',
};

export default async function AdminQuizPage() {
  const quizzes = await getAdminQuizList();
  const csrfTokenDelete = issueCsrfToken('admin:quiz:delete');

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-foreground text-2xl font-bold">Quizzes</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage quiz content, questions, and answers
          </p>
        </div>
        <Link
          href="/admin/quiz/new"
          className="bg-foreground text-background hover:bg-foreground/90 inline-flex items-center rounded-md px-4 py-2 text-sm font-medium transition-colors"
        >
          + New Quiz
        </Link>
      </div>

      <div className="mt-6">
        <QuizListTable quizzes={quizzes} csrfTokenDelete={csrfTokenDelete} />
      </div>
    </div>
  );
}
