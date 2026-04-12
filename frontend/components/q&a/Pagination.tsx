'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  accentColor: string;
  pageSize?: number;
  pageSizeOptions?: readonly number[];
  onPageSizeChange?: (size: number) => void;
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
  pageSize = 10,
  pageSizeOptions = [10],
  onPageSizeChange,
}: PaginationProps) {
  const t = useTranslations('qa.pagination');
  const accentSoft = hexToRgba(accentColor, 0.16);
  const accentGlow = hexToRgba(accentColor, 0.22);
  const [isMobile, setIsMobile] = useState(false);
  const [isPageSizeOpen, setIsPageSizeOpen] = useState(false);
  const pageSizeDropdownRef = useRef<HTMLDivElement>(null);
  const pageSizeListboxId = useId();

  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px)');
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!isPageSizeOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (
        pageSizeDropdownRef.current &&
        !pageSizeDropdownRef.current.contains(event.target as Node)
      ) {
        setIsPageSizeOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPageSizeOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isPageSizeOpen]);

  const effectiveTotalPages = Math.max(totalPages, 1);

  const getPageNumbers = (): (number | 'ellipsis')[] => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = isMobile ? 3 : 5;

    if (effectiveTotalPages <= maxVisible + 2) {
      for (let i = 1; i <= effectiveTotalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);

      if (currentPage <= 3) {
        for (
          let i = 2;
          i <= Math.min(maxVisible, effectiveTotalPages - 1);
          i++
        ) {
          pages.push(i);
        }
        if (effectiveTotalPages > maxVisible) {
          pages.push('ellipsis');
        }
      } else if (currentPage >= effectiveTotalPages - 2) {
        pages.push('ellipsis');
        for (
          let i = effectiveTotalPages - maxVisible + 1;
          i < effectiveTotalPages;
          i++
        ) {
          if (i > 1) pages.push(i);
        }
      } else {
        pages.push('ellipsis');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('ellipsis');
      }

      pages.push(effectiveTotalPages);
    }

    return pages;
  };

  const pages = getPageNumbers();

  return (
    <div
      className="relative mt-8 w-full"
      style={
        {
          '--qa-accent': accentColor,
          '--qa-accent-soft': accentSoft,
          '--qa-accent-glow': accentGlow,
        } as React.CSSProperties
      }
    >
      <nav
        className="flex items-center justify-center gap-1 sm:gap-2"
        aria-label={t('label')}
      >
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className={cn(
            'rounded-lg px-2 py-2 text-sm font-medium transition-colors sm:px-3',
            'border border-gray-300 bg-white/90 dark:border-gray-700 dark:bg-neutral-900/80',
            currentPage === 1
              ? 'cursor-not-allowed text-gray-400 dark:text-gray-600'
              : 'text-gray-700 hover:bg-[var(--qa-accent-soft)] dark:text-gray-300'
          )}
          aria-label={t('previousPage')}
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
          disabled={currentPage >= effectiveTotalPages}
          className={cn(
            'rounded-lg px-2 py-2 text-sm font-medium transition-colors sm:px-3',
            'border border-gray-300 bg-white/90 dark:border-gray-700 dark:bg-neutral-900/80',
            currentPage >= effectiveTotalPages
              ? 'cursor-not-allowed text-gray-400 dark:text-gray-600'
              : 'text-gray-700 hover:bg-[var(--qa-accent-soft)] dark:text-gray-300'
          )}
          aria-label={t('nextPage')}
        >
          <span className="hidden sm:inline">{t('next')}</span> →
        </button>
      </nav>

      {onPageSizeChange && pageSizeOptions.length > 1 && (
        <div className="absolute top-1/2 right-0 hidden -translate-y-1/2 items-center gap-2 lg:flex">
          <label
            id="qa-page-size-label"
            className="text-xs font-medium whitespace-nowrap text-gray-600 dark:text-gray-300"
          >
            {t('itemsPerPage')}
          </label>
          <div
            ref={pageSizeDropdownRef}
            className="relative rounded-lg border bg-white/90 shadow-sm dark:bg-neutral-900/80"
            style={{
              borderColor: accentColor,
              boxShadow: `0 0 0 1px ${accentSoft}`,
            }}
          >
            <button
              id="qa-page-size-trigger"
              type="button"
              onClick={() => setIsPageSizeOpen(prev => !prev)}
              aria-label={t('itemsPerPageAria')}
              aria-haspopup="listbox"
              aria-expanded={isPageSizeOpen}
              aria-controls={pageSizeListboxId}
              aria-labelledby="qa-page-size-label qa-page-size-trigger"
              className="flex min-w-20 items-center justify-between gap-2 rounded-lg bg-transparent px-3 py-2 text-sm font-medium text-gray-800 transition-colors outline-none hover:bg-[var(--qa-accent-soft)] focus:bg-[var(--qa-accent-soft)] dark:text-gray-200"
            >
              <span>{pageSize}</span>
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-gray-600 transition-transform dark:text-gray-300',
                  isPageSizeOpen && 'rotate-180'
                )}
              />
            </button>

            {isPageSizeOpen && (
              <ul
                id={pageSizeListboxId}
                role="listbox"
                aria-label={t('itemsPerPageAria')}
                className="absolute right-0 bottom-[calc(100%+8px)] z-[80] min-w-full rounded-lg border bg-white/95 p-1 shadow-lg backdrop-blur-md dark:bg-neutral-900/90"
                style={{
                  borderColor: accentColor,
                  boxShadow: `0 10px 24px ${accentGlow}`,
                }}
              >
                {pageSizeOptions.map(size => {
                  const selected = size === pageSize;
                  return (
                    <li key={size}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => {
                          onPageSizeChange(size);
                          setIsPageSizeOpen(false);
                        }}
                        className={cn(
                          'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm font-medium transition-colors',
                          selected
                            ? 'bg-[var(--qa-accent-soft)] text-gray-900 dark:text-gray-100'
                            : 'text-gray-700 hover:bg-[var(--qa-accent-soft)] dark:text-gray-300'
                        )}
                      >
                        <span>{size}</span>
                        {selected && (
                          <Check className="h-3.5 w-3.5 text-gray-700 dark:text-gray-100" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
