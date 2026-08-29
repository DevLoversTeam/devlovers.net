'use client';

import { Bookmark, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type CSSProperties, useState } from 'react';

import type { QaQuestionFilter } from '@/components/q&a/types';
import type { ProgressMutationResult } from '@/components/q&a/useQuestionProgress';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { cn } from '@/lib/utils';

type QuestionProgressToolbarProps = {
  categoryLabel: string;
  accentColor: string;
  totalQuestions: number;
  viewedCount: number;
  bookmarkedCount: number;
  filter: QaQuestionFilter;
  isAuthenticated: boolean;
  isLoading?: boolean;
  onFilterChange: (filter: QaQuestionFilter) => void;
  onResetProgress: () => Promise<ProgressMutationResult>;
};

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return `rgba(0, 0, 0, ${alpha})`;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function QuestionProgressToolbar({
  categoryLabel,
  accentColor,
  totalQuestions,
  viewedCount,
  bookmarkedCount,
  filter,
  isAuthenticated,
  isLoading = false,
  onFilterChange,
  onResetProgress,
}: QuestionProgressToolbarProps) {
  const t = useTranslations('qa');
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const progressPercentage =
    totalQuestions > 0
      ? Math.min(100, Math.round((viewedCount / totalQuestions) * 100))
      : 0;
  const trackBorder = hexToRgba(accentColor, 0.38);
  const progressFill = `linear-gradient(90deg, ${hexToRgba(accentColor, 0.72)} 0%, ${hexToRgba(accentColor, 0.18)} 100%)`;

  const confirmReset = async () => {
    setIsResetting(true);
    try {
      const result = await onResetProgress();
      if (result !== 'error') setIsResetOpen(false);
    } finally {
      setIsResetting(false);
    }
  };

  const filterButton = (value: QaQuestionFilter, label: string) => (
    <button
      type="button"
      aria-pressed={filter === value}
      onClick={() => onFilterChange(value)}
      className={cn(
        'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-(--accent-primary)/40 focus-visible:outline-none',
        filter === value
          ? 'bg-(--accent-primary) text-white shadow-sm'
          : 'text-gray-600 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/10'
      )}
    >
      {value === 'bookmarked' && (
        <Bookmark aria-hidden="true" className="h-3.5 w-3.5" />
      )}
      {label}
    </button>
  );

  return (
    <section className="mb-4" aria-label={t('progressControls')}>
      <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400"
          aria-live="polite"
        >
          <span>
            {t('progressLabel')}:{' '}
            <strong className="font-semibold text-gray-900 tabular-nums dark:text-gray-100">
              {viewedCount}/{totalQuestions}
            </strong>
          </span>
          {isAuthenticated && (
            <span className="inline-flex items-center gap-1.5">
              <Bookmark aria-hidden="true" className="h-3.5 w-3.5" />
              {t('bookmarkedCount', { count: bookmarkedCount })}
            </span>
          )}
        </div>

        {isAuthenticated && (
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label={t('filters.label')}
              className="inline-flex rounded-full border border-black/10 bg-white/60 p-0.5 dark:border-white/10 dark:bg-white/5"
            >
              {filterButton('all', t('filters.all'))}
              {filterButton(
                'bookmarked',
                t('filters.bookmarked', { count: bookmarkedCount })
              )}
            </div>

            <button
              type="button"
              disabled={viewedCount === 0 || isLoading}
              onClick={() => setIsResetOpen(true)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--qa-progress-border)] px-3 text-xs font-medium text-[var(--qa-progress-accent)] transition-colors hover:border-red-500 hover:text-red-500 focus-visible:ring-2 focus-visible:ring-red-500/30 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45"
              style={
                {
                  '--qa-progress-accent': accentColor,
                  '--qa-progress-border': trackBorder,
                } as CSSProperties
              }
            >
              <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
              {t('resetProgress')}
            </button>
          </div>
        )}
      </div>

      <div
        className="h-3 overflow-hidden rounded-full border bg-white/5 dark:bg-white/5"
        style={{ borderColor: trackBorder }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none"
          style={{
            width: `${progressPercentage}%`,
            background: progressFill,
            boxShadow: `0 0 24px ${hexToRgba(accentColor, 0.3)}`,
          }}
        />
      </div>

      <ConfirmModal
        isOpen={isResetOpen}
        title={t('reset.title', { category: categoryLabel })}
        message={t('reset.description', {
          viewed: viewedCount,
          bookmarks: bookmarkedCount,
        })}
        confirmText={t('reset.confirm')}
        cancelText={t('reset.cancel')}
        variant="danger"
        isConfirming={isResetting}
        onConfirm={() => void confirmReset()}
        onCancel={() => setIsResetOpen(false)}
      />
    </section>
  );
}
