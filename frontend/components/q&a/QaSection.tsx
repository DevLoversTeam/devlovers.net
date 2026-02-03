'use client';

import { useTranslations } from 'next-intl';

import AccordionList from '@/components/q&a/AccordionList';
import { Pagination } from '@/components/q&a/Pagination';
import type { CategorySlug } from '@/components/q&a/types';
import { useQaTabs } from '@/components/q&a/useQaTabs';
import { CategoryTabButton } from '@/components/shared/CategoryTabButton';
import { Tabs, TabsContent, TabsList } from '@/components/ui/tabs';
import { categoryData } from '@/data/category';
import { categoryTabStyles } from '@/data/categoryStyles';
import { cn } from '@/lib/utils';

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
                <div className="h-8 w-8 animate-spin border-b-2" />
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
                <p className="py-12 text-center">{t('noQuestions')}</p>
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
          accentColor={
            categoryTabStyles[active as keyof typeof categoryTabStyles].accent
          }
        />
      )}
    </div>
  );
}
