'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import AccordionList from '@/components/q&a/AccordionList';
import { GuestProgressPrompt } from '@/components/q&a/GuestProgressPrompt';
import { Pagination } from '@/components/q&a/Pagination';
import { QuestionProgressToolbar } from '@/components/q&a/QuestionProgressToolbar';
import type { CategorySlug } from '@/components/q&a/types';
import { useQaTabs } from '@/components/q&a/useQaTabs';
import { useQuestionProgress } from '@/components/q&a/useQuestionProgress';
import { CategoryTabButton } from '@/components/shared/CategoryTabButton';
import { Loader } from '@/components/shared/Loader';
import { Tabs, TabsContent, TabsList } from '@/components/ui/tabs';
import { categoryData } from '@/data/category';
import { getCategoryTabStyle } from '@/data/categoryStyles';
import { cn } from '@/lib/utils';

export default function TabsSection() {
  const t = useTranslations('qa');
  const sectionRef = useRef<HTMLDivElement>(null);
  const pendingScrollRef = useRef(false);
  const {
    active,
    currentPage,
    filter,
    focusedQuestionId,
    handleCategoryChange,
    handleFilterChange,
    handlePageChange,
    handlePageSizeChange,
    isLoading,
    items,
    localeKey,
    pageSize,
    pageSizeOptions,
    totalItems,
    totalPages,
  } = useQaTabs();
  const questionProgress = useQuestionProgress(active);
  const {
    isAuthenticated,
    isLoading: isProgressLoading,
    markAsViewed,
  } = questionProgress;
  const [isGuestPromptRequested, setIsGuestPromptRequested] = useState(false);
  const [isGuestPromptDismissed, setIsGuestPromptDismissed] = useState(false);
  const [guestReturnTo, setGuestReturnTo] = useState('');
  const isGuestPromptOpen =
    isGuestPromptRequested &&
    !isGuestPromptDismissed &&
    !isProgressLoading &&
    !isAuthenticated;
  const activeCategoryLabel = useMemo(() => {
    const category = categoryData.find(item => item.slug === active);
    return (
      category?.translations[localeKey] ?? category?.translations.en ?? active
    );
  }, [active, localeKey]);
  const animationKey = useMemo(
    () => `qa-${active}-${currentPage}`,
    [active, currentPage]
  );
  const emptyStateLines = useMemo(
    () =>
      t('noQuestions')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean),
    [t]
  );

  const clearSelection = useCallback(() => {
    if (typeof window === 'undefined') return;
    const selection = window.getSelection?.();
    if (selection && !selection.isCollapsed) {
      selection.removeAllRanges();
    }
  }, []);

  const scrollToTop = useCallback((behavior: ScrollBehavior = 'auto') => {
    if (typeof window === 'undefined') return;
    const root = document.scrollingElement || document.documentElement;
    root.scrollTo({ top: 0, behavior });
    window.scrollTo({ top: 0, behavior });
  }, []);

  const onPageChange = useCallback(
    (page: number) => {
      clearSelection();
      scrollToTop('auto');
      pendingScrollRef.current = true;
      handlePageChange(page);
    },
    [clearSelection, handlePageChange, scrollToTop]
  );

  const handleQuestionOpened = useCallback(
    async (questionId: string) => {
      const result = await markAsViewed(questionId);
      if (result !== 'unauthenticated' || isGuestPromptRequested) return;

      setGuestReturnTo(
        typeof window === 'undefined'
          ? `/${localeKey}/q&a`
          : `${window.location.pathname}${window.location.search}`
      );
      setIsGuestPromptRequested(true);
    },
    [isGuestPromptRequested, localeKey, markAsViewed]
  );

  useEffect(() => {
    if (!pendingScrollRef.current || isLoading) return;
    pendingScrollRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      scrollToTop('auto');
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentPage, isLoading, scrollToTop]);

  useEffect(() => {
    if (
      !questionProgress.isLoading &&
      !questionProgress.isAuthenticated &&
      filter === 'bookmarked'
    ) {
      handleFilterChange('all');
    }
  }, [
    filter,
    handleFilterChange,
    questionProgress.isAuthenticated,
    questionProgress.isLoading,
  ]);

  return (
    <div className="w-full" ref={sectionRef}>
      <Tabs value={active} onValueChange={handleCategoryChange}>
        <TabsList className="mb-6 flex !h-auto !w-full flex-wrap items-stretch justify-start gap-3 !bg-transparent !p-0">
          {categoryData.map(category => {
            const value = category.slug as CategorySlug;
            return (
              <CategoryTabButton
                key={value}
                value={value}
                label={
                  category.translations[localeKey] ??
                  category.translations.en ??
                  value
                }
                style={getCategoryTabStyle(value)}
                isActive={active === value}
              />
            );
          })}
        </TabsList>

        <QuestionProgressToolbar
          categoryLabel={activeCategoryLabel}
          accentColor={getCategoryTabStyle(active).accent}
          totalQuestions={
            questionProgress.totalQuestions ||
            (filter === 'all' ? totalItems : 0)
          }
          viewedCount={questionProgress.viewedCount}
          bookmarkedCount={questionProgress.bookmarkedCount}
          filter={filter}
          isAuthenticated={questionProgress.isAuthenticated}
          isLoading={questionProgress.isLoading}
          onFilterChange={handleFilterChange}
          onResetProgress={questionProgress.resetProgress}
        />

        {categoryData.map(category => (
          <TabsContent key={category.slug} value={category.slug}>
            {isLoading && (
              <div className="flex justify-center py-12">
                <Loader className="mx-auto" size={240} />
              </div>
            )}
            <div
              className={cn(
                'transition-opacity duration-300',
                isLoading ? 'opacity-0' : 'opacity-100'
              )}
              aria-busy={isLoading}
            >
              {items.length ? (
                <AccordionList
                  key={animationKey}
                  items={items}
                  initialOpenQuestionId={focusedQuestionId}
                  viewedItems={questionProgress.viewedItems}
                  bookmarkedItems={questionProgress.bookmarkedItems}
                  onQuestionOpened={handleQuestionOpened}
                  onToggleBookmark={questionProgress.toggleBookmark}
                />
              ) : (
                <div className="py-20 text-center">
                  {filter === 'bookmarked' ? (
                    <BookmarkEmptyState
                      title={t('filters.emptyTitle')}
                      description={t('filters.emptyDescription')}
                      actionLabel={t('filters.showAll')}
                      onShowAll={() => handleFilterChange('all')}
                    />
                  ) : emptyStateLines[0] ? (
                    <p className="motion-safe:animate-fade-up text-lg font-semibold text-gray-900 motion-reduce:opacity-100 dark:text-white">
                      {emptyStateLines[0]}
                    </p>
                  ) : null}
                  {filter !== 'bookmarked' && emptyStateLines[1] && (
                    <p className="motion-safe:animate-fade-up mt-2 text-gray-400 motion-safe:[animation-delay:150ms] motion-reduce:opacity-100 dark:text-gray-300">
                      {emptyStateLines[1]}
                    </p>
                  )}
                  {filter !== 'bookmarked' && emptyStateLines[2] && (
                    <p className="motion-safe:animate-fade-up mt-1 text-gray-500 motion-safe:[animation-delay:300ms] motion-reduce:opacity-100 dark:text-gray-400">
                      {emptyStateLines[2]}
                    </p>
                  )}
                </div>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {!isLoading && items.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={onPageChange}
          pageSize={pageSize}
          pageSizeOptions={pageSizeOptions}
          onPageSizeChange={handlePageSizeChange}
          accentColor={getCategoryTabStyle(active).accent}
        />
      )}

      <GuestProgressPrompt
        isOpen={isGuestPromptOpen}
        returnTo={guestReturnTo}
        onClose={() => setIsGuestPromptDismissed(true)}
      />
    </div>
  );
}

function BookmarkEmptyState({
  title,
  description,
  actionLabel,
  onShowAll,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onShowAll: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center">
      <p className="text-lg font-semibold text-gray-900 dark:text-white">
        {title}
      </p>
      <p className="mt-2 text-gray-500 dark:text-gray-400">{description}</p>
      <button
        type="button"
        onClick={onShowAll}
        className="mt-5 inline-flex min-h-10 items-center rounded-full bg-(--accent-primary) px-5 text-sm font-semibold text-white transition-colors hover:bg-(--accent-hover) focus-visible:ring-2 focus-visible:ring-(--accent-primary)/40 focus-visible:outline-none"
      >
        {actionLabel}
      </button>
    </div>
  );
}
