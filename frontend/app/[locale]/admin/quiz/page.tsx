import { Metadata } from 'next';

import { QuizListTable } from '@/components/admin/quiz/QuizListTable';
import { getAdminQuizList } from '@/db/queries/quizzes/admin-quiz';

export const metadata: Metadata = {
  title: 'Quiz Admin | DevLovers',
};

export default async function AdminQuizPage() {
  const quizzes = await getAdminQuizList();

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-foreground text-2xl font-bold">Quizzes</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Manage quiz content, questions, and answers
      </p>

      <div className="mt-6">
        <QuizListTable quizzes={quizzes} />
      </div>
    </div>
  );
}
