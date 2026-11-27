'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { getPageNumbers } from '@/lib/pagination';
import { cn } from '@/lib/utils';

interface BlogPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  accentColor: string;
}

export function BlogPagination({
  currentPage,
  totalPages,
  onPageChange,
  accentColor,
}: BlogPaginationProps) {
  const t = useTranslations('blog.pagination');
  const tPagination = useTranslations('common.pagination');
  const accentSoft = `color-mix(in srgb, ${accentColor} 16%, transparent)`;
  const accentGlow = `color-mix(in srgb, ${accentColor} 22%, transparent)`;
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px)');
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  if (totalPages <= 1) return null;

  const pages = getPageNumbers(currentPage, totalPages, isMobile ? 3 : 5);

  return (
    <nav
      className="mt-8 flex items-center justify-center gap-1 sm:gap-2"
      style={
        {
          '--qa-accent': accentColor,
          '--qa-accent-soft': accentSoft,
          '--qa-accent-glow': accentGlow,
        } as React.CSSProperties
      }
      aria-label={t('label')}
    >
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className={cn(
          'rounded-lg px-2 py-2 text-sm font-medium transition-colors sm:px-3',
          'border border-gray-300 bg-white/90 dark:border-gray-700 dark:bg-neutral-900/80',
          currentPage === 1
            ? 'cursor-not-allowed text-gray-400 dark:text-gray-600'
            : 'text-gray-700 hover:bg-[var(--qa-accent-soft)] dark:text-gray-300'
        )}
        aria-label={tPagination('previousPage')}
      >
        ← <span className="hidden sm:inline">{t('previous')}</span>
      </button>

      <div className="mx-1 flex items-center gap-1 sm:mx-2">
        {pages.map((page, index) =>
          page === 'ellipsis' ? (
            <span
              key={`ellipsis-${index}`}
              className="px-2 py-2 text-gray-500 dark:text-gray-400"
            >
              ...
            </span>
          ) : (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              disabled={page === currentPage}
              className={cn(
                'min-w-[40px] overflow-hidden rounded-lg border border-transparent bg-white/90 px-3 py-2 text-sm font-medium transition-colors dark:bg-neutral-900/80',
                page === currentPage
                  ? 'text-gray-700 shadow-sm dark:text-gray-300'
                  : 'text-gray-700 hover:bg-[var(--qa-accent-soft)] dark:text-gray-300'
              )}
              style={
                page === currentPage
                  ? {
                      backgroundColor: accentSoft,
                      borderColor: accentColor,
                      boxShadow: `inset 0 0 18px ${accentGlow}`,
                    }
                  : undefined
              }
              aria-label={tPagination('page', { page })}
              aria-current={page === currentPage ? 'page' : undefined}
            >
              {page}
            </button>
          )
        )}
      </div>

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className={cn(
          'rounded-lg px-2 py-2 text-sm font-medium transition-colors sm:px-3',
          'border border-gray-300 bg-white/90 dark:border-gray-700 dark:bg-neutral-900/80',
          currentPage === totalPages
            ? 'cursor-not-allowed text-gray-400 dark:text-gray-600'
            : 'text-gray-700 hover:bg-[var(--qa-accent-soft)] dark:text-gray-300'
        )}
        aria-label={tPagination('nextPage')}
      >
        <span className="hidden sm:inline">{t('next')}</span> →
      </button>
    </nav>
  );
}
