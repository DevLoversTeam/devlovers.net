'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  accentColor: string;
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return `rgba(0, 0, 0, ${alpha})`;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  accentColor,
}: PaginationProps) {
  const t = useTranslations('qa.pagination');
  const accentSoft = hexToRgba(accentColor, 0.16);
  const accentGlow = hexToRgba(accentColor, 0.22);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px)');
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  if (totalPages <= 1) return null;

  const getPageNumbers = (): (number | 'ellipsis')[] => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = isMobile ? 3 : 5;

    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);

      if (currentPage <= 3) {
        for (let i = 2; i <= Math.min(maxVisible, totalPages - 1); i++) {
          pages.push(i);
        }
        if (totalPages > maxVisible) {
          pages.push('ellipsis');
        }
      } else if (currentPage >= totalPages - 2) {
        pages.push('ellipsis');
        for (let i = totalPages - maxVisible + 1; i < totalPages; i++) {
          if (i > 1) pages.push(i);
        }
      } else {
        pages.push('ellipsis');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('ellipsis');
      }

      pages.push(totalPages);
    }

    return pages;
  };

  const pages = getPageNumbers();

  return (
    <nav
      className="flex items-center justify-center gap-1 mt-8 sm:gap-2"
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
          'px-2 py-2 text-sm font-medium rounded-lg transition-colors sm:px-3',
          'border border-gray-300 bg-white/90 dark:border-gray-700 dark:bg-neutral-900/80',
          currentPage === 1
            ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
            : 'text-gray-700 dark:text-gray-300 hover:bg-[var(--qa-accent-soft)]'
        )}
        aria-label={t('previousPage')}
      >
        ← <span className="hidden sm:inline">{t('previous')}</span>
      </button>

      <div className="flex items-center gap-1 mx-1 sm:mx-2">
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
                'min-w-[40px] px-3 py-2 text-sm font-medium rounded-lg transition-colors border border-transparent overflow-hidden bg-white/90 dark:bg-neutral-900/80',
                page === currentPage
                  ? 'shadow-sm text-gray-700 dark:text-gray-300'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-[var(--qa-accent-soft)]'
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
              aria-label={t('page', { page })}
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
          'px-2 py-2 text-sm font-medium rounded-lg transition-colors sm:px-3',
          'border border-gray-300 bg-white/90 dark:border-gray-700 dark:bg-neutral-900/80',
          currentPage === totalPages
            ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
            : 'text-gray-700 dark:text-gray-300 hover:bg-[var(--qa-accent-soft)]'
        )}
        aria-label={t('nextPage')}
      >
        <span className="hidden sm:inline">{t('next')}</span> →
      </button>
    </nav>
  );
}
