'use client';

import { ChevronRight, Shield } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Badge, type BadgeProps } from '@/components/ui/badge';
import { type CategoryTabStyle,categoryTabStyles } from '@/data/categoryStyles';
import type { UserLastAttempt } from '@/types/quiz';

interface QuizResultRowProps {
  attempt: UserLastAttempt;
  locale: string;
}

function formatRelativeTime(date: Date, locale: string): string {
  const now = Date.now();
  const diffMs = now - new Date(date).getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffMonths = Math.floor(diffDays / 30);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (diffMonths > 0) return rtf.format(-diffMonths, 'month');
  if (diffDays > 0) return rtf.format(-diffDays, 'day');
  if (diffHours > 0) return rtf.format(-diffHours, 'hour');
  if (diffMinutes > 0) return rtf.format(-diffMinutes, 'minute');
  return rtf.format(-diffSeconds, 'second');
}

type StatusConfig = {
  variant: BadgeProps['variant'];
  label: 'mastered' | 'needsReview' | 'study';
  dotColor: string;
};

function getStatus(percentage: number): StatusConfig {
  if (percentage === 100) return { variant: 'success', label: 'mastered', dotColor: 'bg-emerald-500' };
  if (percentage >= 70) return { variant: 'warning', label: 'needsReview', dotColor: 'bg-amber-500' };
  return { variant: 'danger', label: 'study', dotColor: 'bg-red-500' };
}

function ProgressBar({ percentage }: { percentage: number }) {
  const color =
    percentage === 100
      ? 'bg-emerald-500'
      : percentage >= 70
        ? 'bg-amber-500'
        : 'bg-red-500';

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-neutral-700">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

function getCategoryStyle(slug: string | null): CategoryTabStyle | null {
  if (!slug) return null;
  return (categoryTabStyles as Record<string, (typeof categoryTabStyles)[keyof typeof categoryTabStyles]>)[slug] ?? null;
}

export function QuizResultRow({ attempt, locale }: QuizResultRowProps) {
  const t = useTranslations('dashboard.quizResults');
  const router = useRouter();

  const pct = Number(attempt.percentage);
  const status = getStatus(pct);
  const isMastered = pct === 100;
  const catStyle = getCategoryStyle(attempt.categorySlug);

  const baseStyles = 'rounded-xl border border-gray-100 dark:border-white/5 px-3 py-2.5 md:px-4 md:py-3 transition-all duration-300';
  const interactiveStyles = !isMastered
    ? 'group cursor-pointer bg-white/60 dark:bg-neutral-900/60 hover:-translate-y-0.5 hover:shadow-md hover:border-(--accent-primary)/30 dark:hover:border-(--accent-primary)/30'
    : 'bg-white/40 dark:bg-neutral-900/40 opacity-60';

  const handleClick = () => {
    if (!isMastered) {
      router.push(`/${locale}/dashboard/quiz-review/${attempt.attemptId}`);
    }
  };

  return (
    <div
      className={`${baseStyles} ${interactiveStyles}`}
      onClick={isMastered ? undefined : handleClick}
      role={isMastered ? undefined : 'link'}
      tabIndex={isMastered ? undefined : 0}
      onKeyDown={isMastered ? undefined : (e) => { if (e.key === 'Enter') handleClick(); }}
    >
      {/* Mobile layout: left content + right badge */}
      <div className="flex items-center gap-3 sm:grid sm:grid-cols-[minmax(0,2fr)_1fr_auto_20px] md:hidden">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2.5 max-w-[200px] sm:max-w-[140px]">
            {catStyle && (
              <Image
                src={catStyle.icon}
                alt=""
                width={20}
                height={20}
                className={`shrink-0 ${catStyle.iconClassName ?? ''}`}
              />
            )}
            <div className="truncate text-sm font-medium text-gray-900 dark:text-white">
              {attempt.quizTitle ?? attempt.quizSlug}
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-gray-400 overflow-hidden whitespace-nowrap max-w-full">
            <span style={catStyle ? { color: catStyle.accent } : undefined} className="truncate max-w-[70px] sm:max-w-none">
              {attempt.categoryName ?? attempt.categorySlug ?? ''}
            </span>
            <span className="sm:hidden shrink-0 text-gray-200 dark:text-gray-700">&middot;</span>
            <span className="sm:hidden shrink-0 tabular-nums">{attempt.score}/{attempt.totalQuestions}</span>
            <span className="sm:hidden shrink-0 text-gray-200 dark:text-gray-700">&middot;</span>
            <span className="sm:hidden shrink-0 tabular-nums">{Math.round(pct)}%</span>
            <span className="sm:hidden shrink-0 text-gray-200 dark:text-gray-700">&middot;</span>
            {attempt.pointsEarned > 0 ? (
              <span className="sm:hidden shrink-0 font-medium text-emerald-600 dark:text-emerald-400">
                +{attempt.pointsEarned}
              </span>
            ) : (
              <span className="sm:hidden shrink-0 text-gray-300 dark:text-gray-600">&mdash;</span>
            )}
          </div>
        </div>
        <div className="hidden flex-1 items-center justify-end gap-2 text-xs text-gray-400 sm:flex md:hidden">
          <span className="tabular-nums">{attempt.score}/{attempt.totalQuestions}</span>
          <span className="text-gray-200 dark:text-gray-700">&middot;</span>
          <span className="tabular-nums">{Math.round(pct)}%</span>
          <span className="text-gray-200 dark:text-gray-700">&middot;</span>
          {attempt.pointsEarned > 0 ? (
            <span className="font-medium text-emerald-600 dark:text-emerald-400">
              +{attempt.pointsEarned}
            </span>
          ) : (
            <span className="text-gray-300 dark:text-gray-600">&mdash;</span>
          )}
        </div>
        <div className="shrink-0 flex items-center justify-end min-w-[80px]">
          <Badge variant={status.variant} className="gap-1.5 rounded-full px-2 py-0.5 text-[10px] sm:px-2.5 sm:py-0.5 sm:text-xs">
            <span className={`h-1.5 w-1.5 rounded-full ${status.dotColor}`} />
            {t(status.label)}
          </Badge>
        </div>
        {!isMastered && (
          <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-(--accent-primary) dark:text-gray-600" />
        )}
      </div>

      <div className="hidden items-center gap-2 md:grid md:grid-cols-[minmax(0,4fr)_1fr_1.5fr_1fr_1fr_1fr_20px] lg:grid-cols-[minmax(0,4fr)_1fr_1.5fr_1fr_1fr_1fr_1.2fr_20px]">
        <div className="flex items-center gap-2.5 overflow-hidden">
          {catStyle && (
            <Image
              src={catStyle.icon}
              alt=""
              width={20}
              height={20}
              className={`shrink-0 ${catStyle.iconClassName ?? ''}`}
            />
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-gray-900 dark:text-white">
              {attempt.quizTitle ?? attempt.quizSlug}
            </div>
            <div
              className="truncate text-xs"
              style={catStyle ? { color: catStyle.accent } : undefined}
            >
              {attempt.categoryName ?? attempt.categorySlug ?? ''}
            </div>
          </div>
        </div>

        {/* Score */}
        <div className="text-center text-sm tabular-nums text-gray-600 dark:text-gray-400">
          {attempt.score}/{attempt.totalQuestions}
        </div>

        {/* Percentage + bar */}
        <div className="flex items-center gap-1.5">
          <ProgressBar percentage={pct} />
          <span className="w-9 text-center text-xs tabular-nums text-gray-500">
            {Math.round(pct)}%
          </span>
        </div>

        {/* Integrity — visible on lg+ */}
        <div className="text-center text-sm text-gray-400">
          {attempt.integrityScore !== null && (
            <span className="inline-flex items-center justify-center gap-1">
              <Shield className="h-3 w-3" />
              {attempt.integrityScore}
            </span>
          )}
        </div>

        {/* Points */}
        <div className="text-center text-sm">
          {attempt.pointsEarned > 0 ? (
            <span className="font-medium text-emerald-600 dark:text-emerald-400">
              +{attempt.pointsEarned}
            </span>
          ) : (
            <span className="text-gray-300 dark:text-gray-600">&mdash;</span>
          )}
        </div>

        {/* Date — visible on lg+ */}
        <div className="hidden text-center text-xs text-gray-400 lg:block">
          {formatRelativeTime(attempt.completedAt, locale)}
        </div>

        {/* Status badge */}
        <div className="flex justify-center">
          <Badge variant={status.variant} className="gap-1.5 rounded-full">
            <span className={`h-1.5 w-1.5 rounded-full ${status.dotColor}`} />
            {t(status.label)}
          </Badge>
        </div>

        {/* Arrow */}
        <div className="text-center">
          {!isMastered && (
            <ChevronRight className="h-4 w-4 text-gray-300 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-(--accent-primary) dark:text-gray-600" />
          )}
        </div>
      </div>
    </div>
  );
}
