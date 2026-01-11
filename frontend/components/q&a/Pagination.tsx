'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: PaginationProps) {
  const t = useTranslations('qa.pagination');

  if (totalPages <= 1) return null;

  const getPageNumbers = (): (number | 'ellipsis')[] => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = 5;

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
      className="flex items-center justify-center gap-1 mt-8"
      aria-label={t('label')}
    >
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className={cn(
          'px-3 py-2 text-sm font-medium rounded-lg transition-colors',
          'border border-gray-300 dark:border-gray-700',
          currentPage === 1
            ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
        )}
        aria-label={t('previousPage')}
      >
        ← {t('previous')}
      </button>

      <div className="flex items-center gap-1 mx-2">
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
                'min-w-[40px] px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                page === currentPage
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              )}
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
          'px-3 py-2 text-sm font-medium rounded-lg transition-colors',
          'border border-gray-300 dark:border-gray-700',
          currentPage === totalPages
            ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
        )}
        aria-label={t('nextPage')}
      >
        {t('next')} →
      </button>
    </nav>
  );
}