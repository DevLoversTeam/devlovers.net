import { Metadata } from 'next';

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
    <div className="mx-auto max-w-5xl px-6 py-8">
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
    </div>
  );
}
