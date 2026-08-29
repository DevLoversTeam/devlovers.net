'use client';

import { Bookmark, BookOpen, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

import { getCategoryTabStyle } from '@/data/categoryStyles';
import { Link } from '@/i18n/routing';

export type DashboardQuestionProgressItem = {
  categoryId: string;
  categorySlug: string;
  categoryTitle: string | null;
  totalQuestions: number;
  viewedCount: number;
  bookmarkedCount: number;
  lastOpenedQuestionId: string | null;
};

type QuestionProgressSectionProps = {
  progress: DashboardQuestionProgressItem[];
};

function getProgressPercentage(viewedCount: number, totalQuestions: number) {
  if (totalQuestions === 0) return 0;
  return Math.min(100, Math.round((viewedCount / totalQuestions) * 100));
}

export function QuestionProgressSection({
  progress,
}: QuestionProgressSectionProps) {
  const t = useTranslations('dashboard.questionProgress');
  const cardStyles = 'dashboard-card flex flex-col p-6 sm:p-8 lg:p-10';
  const primaryBtnStyles =
    'inline-flex items-center justify-center rounded-full bg-(--accent-primary) px-8 py-3 text-sm font-semibold tracking-widest text-white uppercase transition-all hover:scale-105 hover:bg-(--accent-hover)';

  if (progress.length === 0) {
    return (
      <section className={cardStyles}>
        <div className="flex flex-col items-center justify-center text-center">
          <div className="mb-6 rounded-full bg-gray-100 p-4 dark:bg-neutral-800/50">
            <BookOpen className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">
            {t('title')}
          </h3>
          <p className="mx-auto mb-8 max-w-sm text-gray-500 dark:text-gray-400">
            {t('emptyDescription')}
          </p>
          <Link href="/q&a" className={primaryBtnStyles}>
            {t('browseQuestions')}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className={cardStyles}>
      <div className="mb-6 flex items-center gap-3">
        <div
          aria-hidden="true"
          className="shrink-0 rounded-xl border border-white/20 bg-white/40 p-3 shadow-xs backdrop-blur-xs dark:border-white/10 dark:bg-white/5"
        >
          <BookOpen className="h-5 w-5 text-(--accent-primary) drop-shadow-[0_0_8px_rgba(var(--accent-primary-rgb),0.6)]" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">
            {t('title')}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('subtitle')}
          </p>
        </div>
      </div>

      <div className="mb-2 hidden grid-cols-[minmax(0,3fr)_minmax(150px,1.5fr)_120px_28px_96px] items-center gap-4 px-4 text-xs font-semibold tracking-wider text-gray-400 uppercase md:grid">
        <div>{t('topic')}</div>
        <div>{t('progress')}</div>
        <div className="text-center">{t('status')}</div>
        <div />
        <div className="text-center">{t('saved')}</div>
      </div>

      <div className="flex flex-col gap-2">
        {progress.map(item => {
          const percentage = getProgressPercentage(
            item.viewedCount,
            item.totalQuestions
          );
          const categoryStyle = getCategoryTabStyle(item.categorySlug);
          const categoryTitle = item.categoryTitle ?? item.categorySlug;
          const categoryHref = `/q&a?category=${encodeURIComponent(item.categorySlug)}`;
          const resumeHref = item.lastOpenedQuestionId
            ? `${categoryHref}&question=${encodeURIComponent(item.lastOpenedQuestionId)}`
            : categoryHref;
          const savedHref = `${categoryHref}&filter=bookmarked`;
          const isComplete =
            item.totalQuestions > 0 && item.viewedCount >= item.totalQuestions;

          return (
            <div
              key={item.categoryId}
              className="flex items-stretch gap-2 rounded-xl border border-gray-100 bg-white/60 p-2 transition-all duration-300 hover:-translate-y-0.5 hover:border-(--accent-primary)/30 hover:shadow-md dark:border-white/5 dark:bg-neutral-900/60 dark:hover:border-(--accent-primary)/30"
            >
              <Link
                href={resumeHref}
                className="group grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_20px] items-center gap-3 rounded-lg px-2 py-1.5 focus-visible:ring-2 focus-visible:ring-(--accent-primary)/40 focus-visible:outline-none md:grid-cols-[minmax(0,3fr)_minmax(150px,1.5fr)_120px_28px] md:gap-4"
                aria-label={t('continueTopic', { topic: categoryTitle })}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Image
                    src={categoryStyle.icon}
                    alt=""
                    width={28}
                    height={28}
                    className={`shrink-0 ${categoryStyle.iconClassName ?? ''}`}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                      {categoryTitle}
                    </p>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {t(item.lastOpenedQuestionId ? 'resume' : 'viewed', {
                        viewed: item.viewedCount,
                        total: item.totalQuestions,
                      })}
                    </p>
                  </div>
                </div>

                <div className="hidden min-w-0 md:block">
                  <div className="mb-1.5 flex items-center justify-between text-xs text-gray-500 tabular-nums dark:text-gray-400">
                    <span>
                      {item.viewedCount}/{item.totalQuestions}
                    </span>
                    <span>{percentage}%</span>
                  </div>
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-neutral-700"
                    role="progressbar"
                    aria-label={t('topicProgress', { topic: categoryTitle })}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percentage}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${percentage}%`,
                        backgroundColor: categoryStyle.accent,
                      }}
                    />
                  </div>
                </div>

                <div className="hidden justify-center md:flex">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      isComplete
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    }`}
                  >
                    {t(isComplete ? 'complete' : 'inProgress')}
                  </span>
                </div>

                <ChevronRight className="h-5 w-5 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-(--accent-primary) dark:text-gray-600" />
              </Link>

              <Link
                href={savedHref}
                aria-label={t('openSaved', {
                  topic: categoryTitle,
                  count: item.bookmarkedCount,
                })}
                className="flex w-14 shrink-0 flex-col items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-red-500/10 hover:text-red-500 focus-visible:ring-2 focus-visible:ring-red-500/40 focus-visible:outline-none md:w-24 dark:text-gray-400"
              >
                <Bookmark
                  aria-hidden="true"
                  className="h-4 w-4"
                  fill={item.bookmarkedCount > 0 ? 'currentColor' : 'none'}
                />
                <span className="mt-1 text-xs font-semibold tabular-nums">
                  {item.bookmarkedCount}
                </span>
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
