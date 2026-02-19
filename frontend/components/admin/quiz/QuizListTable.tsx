import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import type { AdminQuizListItem } from '@/db/queries/quizzes/admin-quiz';

const TH = 'px-3 py-2 text-left text-xs font-semibold text-foreground whitespace-nowrap';
const TD = 'px-3 py-2 text-sm';

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
        active
          ? 'bg-emerald-500/10 text-emerald-500'
          : 'bg-muted text-muted-foreground'
      )}
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

interface QuizListTableProps {
  quizzes: AdminQuizListItem[];
}

export function QuizListTable({ quizzes }: QuizListTableProps) {
  if (quizzes.length === 0) {
    return (
      <div className="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
        No quizzes found
      </div>
    );
  }

  return (
    <>
      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {quizzes.map(quiz => (
          <div
            key={quiz.id}
            className="border-border bg-background rounded-lg border p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-foreground truncate text-sm font-semibold">
                  {quiz.title ?? quiz.slug}
                </div>
                <div className="text-muted-foreground mt-0.5 text-xs">
                  {quiz.categoryName ?? '-'}
                </div>
              </div>
              <ActiveBadge active={quiz.isActive} />
            </div>

            <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Questions</dt>
                <dd className="text-foreground">{quiz.questionsCount}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Attempts</dt>
                <dd className="text-foreground">{quiz.attemptCount}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Created</dt>
                <dd className="text-foreground">{formatDate(quiz.createdAt)}</dd>
              </div>
            </dl>

            <div className="mt-3">
              <Link
                href={`/admin/quiz/${quiz.id}`}
                className="border-border text-foreground hover:bg-secondary inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium transition-colors"
              >
                Edit
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <div>
          <table className="divide-border w-full divide-y text-sm">
             <thead className="bg-muted/50">
              <tr>
                <th className={TH}>Title</th>
                <th className={TH}>Category</th>
                <th className={TH}>Questions</th>
                <th className={TH}>Attempts</th>
                <th className={TH}>Active</th>
                <th className={TH}>Created</th>
                <th className={TH}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {quizzes.map(quiz => (
                <tr key={quiz.id} className="hover:bg-muted/50">
                  <td className={cn(TD, 'text-foreground font-medium')}>
                    <div className="max-w-[200px] truncate" title={quiz.title ?? quiz.slug}>
                      {quiz.title ?? quiz.slug}
                    </div>
                  </td>
                  <td className={cn(TD, 'text-muted-foreground')}>
                    {quiz.categoryName ?? '-'}
                  </td>
                  <td className={cn(TD, 'text-muted-foreground')}>
                    {quiz.questionsCount}
                  </td>
                  <td className={cn(TD, 'text-muted-foreground')}>
                    {quiz.attemptCount}
                  </td>
                  <td className={TD}>
                    <ActiveBadge active={quiz.isActive} />
                  </td>
                  <td className={cn(TD, 'text-muted-foreground whitespace-nowrap')}>
                    {formatDate(quiz.createdAt)}
                  </td>
                  <td className={TD}>
                    <Link
                      href={`/admin/quiz/${quiz.id}`}
                      className="border-border text-foreground hover:bg-secondary inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium transition-colors"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
