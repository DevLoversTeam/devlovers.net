import { Metadata } from 'next';

import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
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
    <AdminPageContainer>
      <AdminPageHeader
        title="Quizzes"
        description="Manage quiz content, questions, and answers"
      >
        <Link
          href="/admin/quiz/new"
          className="bg-foreground text-background hover:bg-foreground/90 inline-flex items-center rounded-md px-4 py-2 text-sm font-medium transition-colors"
        >
          + New Quiz
        </Link>
      </AdminPageHeader>

      <div className="mt-6">
        <QuizListTable quizzes={quizzes} csrfTokenDelete={csrfTokenDelete} />
      </div>
    </AdminPageContainer>
  );
}
