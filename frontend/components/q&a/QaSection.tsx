'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import AccordionList from '@/components/q&a/AccordionList';
import { Pagination } from '@/components/q&a/Pagination';
import type { CategorySlug } from '@/components/q&a/types';
import { useQaTabs } from '@/components/q&a/useQaTabs';
import { CategoryTabButton } from '@/components/shared/CategoryTabButton';
import { Loader } from '@/components/shared/Loader';
import { Tabs, TabsContent, TabsList } from '@/components/ui/tabs';
import { categoryData } from '@/data/category';
import { categoryTabStyles } from '@/data/categoryStyles';
import { cn } from '@/lib/utils';

export default function TabsSection() {
  const t = useTranslations('qa');
  const sectionRef = useRef<HTMLDivElement>(null);
  const pendingScrollRef = useRef(false);
  const [isMobile, setIsMobile] = useState(false);
  const {
    active,
    currentPage,
    handleCategoryChange,
    handlePageChange,
    handlePageSizeChange,
    isLoading,
    items,
    localeKey,
    pageSize,
    pageSizeOptions,
    totalPages,
  } = useQaTabs();
  const animationKey = useMemo(
    () => `qa-${active}-${currentPage}`,
    [active, currentPage]
  );

  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px)');
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

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

  useEffect(() => {
    if (!pendingScrollRef.current || isLoading) return;
    pendingScrollRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      scrollToTop('auto');
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentPage, isLoading, scrollToTop]);

  return (
    <div className="w-full" ref={sectionRef}>
      <Tabs value={active} onValueChange={handleCategoryChange}>
        <TabsList className="mb-6 flex !h-auto !w-full flex-wrap items-stretch justify-start gap-3 !bg-transparent !p-0">
          {categoryData.map(category => {
            const slug = category.slug as keyof typeof categoryTabStyles;
            const value = slug as CategorySlug;
            return (
              <CategoryTabButton
                key={slug}
                value={value}
                label={
                  category.translations[localeKey] ??
                  category.translations.en ??
                  value
                }
                style={categoryTabStyles[slug]}
                isActive={active === value}
              />
            );
          })}
        </TabsList>

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
                <AccordionList key={animationKey} items={items} />
              ) : (
                <p className="py-12 text-center">{t('noQuestions')}</p>
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
          accentColor={
            categoryTabStyles[active as keyof typeof categoryTabStyles].accent
          }
        />
      )}
    </div>
  );
}
