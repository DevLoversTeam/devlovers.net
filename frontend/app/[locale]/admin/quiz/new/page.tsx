import { Metadata } from 'next';

import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { CreateQuizForm } from '@/components/admin/quiz/CreateQuizForm';
import { getAdminCategoryList } from '@/db/queries/categories/admin-categories';
import { Link } from '@/i18n/routing';
import { issueCsrfToken } from '@/lib/security/csrf';

export const metadata: Metadata = {
  title: 'New Quiz | DevLovers',
};

export default async function AdminQuizNewPage() {
  const categories = await getAdminCategoryList();
  const csrfTokenQuiz = issueCsrfToken('admin:quiz:create');
  const csrfTokenCategory = issueCsrfToken('admin:category:create');

  return (
    <AdminPageContainer>
      <div className="mb-6">
        <Link
          href="/admin/quiz"
          className="text-muted-foreground hover:text-foreground text-sm transition-colors"
        >
          &larr; Back to quizzes
        </Link>
      </div>

      <h1 className="text-foreground mb-6 text-2xl font-bold">New Quiz</h1>

      <CreateQuizForm
        categories={categories}
        csrfTokenQuiz={csrfTokenQuiz}
        csrfTokenCategory={csrfTokenCategory}
      />
    </AdminPageContainer>
  );
}
