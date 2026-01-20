'use client';

import { useTranslations } from 'next-intl';
import AccordionList from '@/components/q&a/AccordionList';
import { Pagination } from '@/components/q&a/Pagination';
import { Tabs, TabsList, TabsContent } from '@/components/ui/tabs';
import { categoryData } from '@/data/category';
import { useQaTabs } from '@/components/q&a/useQaTabs';
import { QaTabButton } from '@/components/q&a/QaTabButton';
import { qaTabStyles } from '@/data/qaTabs';
import { cn } from '@/lib/utils';
import type { CategorySlug } from '@/components/q&a/types';

export default function TabsSection() {
  const t = useTranslations('qa');
  const {
    active,
    currentPage,
    handleCategoryChange,
    handlePageChange,
    isLoading,
    items,
    localeKey,
    totalPages,
  } = useQaTabs();

  return (
    <div className="w-full">
      <Tabs value={active} onValueChange={handleCategoryChange}>
        <TabsList className="!bg-transparent !p-0 !h-auto !w-full flex flex-wrap items-stretch justify-start gap-3 mb-6">
          {categoryData.map(category => {
            const slug = category.slug as keyof typeof qaTabStyles;
            const value = slug as CategorySlug;
            return (
            <QaTabButton
              key={slug}
              value={value}
              label={
                category.translations[localeKey] ??
                category.translations.en ??
                value
              }
              style={qaTabStyles[slug]}
              isActive={active === value}
            />
            );
          })}
        </TabsList>

        {categoryData.map(category => (
          <TabsContent key={category.slug} value={category.slug}>
            {isLoading && (
              <div className="flex justify-center py-12">
                <div className="animate-spin h-8 w-8 border-b-2" />
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
                <AccordionList items={items} />
              ) : (
                <p className="text-center py-12">
                  {t('noQuestions')}
                </p>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {!isLoading && totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          accentColor={qaTabStyles[active].accent}
        />
      )}
    </div>
  );
}
