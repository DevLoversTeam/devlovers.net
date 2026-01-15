'use client';

import { useTranslations } from 'next-intl';
import { Search, X } from 'lucide-react';

import AccordionList from '@/components/q&a/AccordionList';
import { Pagination } from '@/components/q&a/Pagination';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { categoryData } from '@/data/category';
import { useQaTabs } from '@/components/q&a/useQaTabs';

export default function TabsSection() {
  const t = useTranslations('qa');
  const {
    active,
    currentPage,
    debouncedSearch,
    handleCategoryChange,
    handlePageChange,
    isLoading,
    items,
    localeKey,
    searchQuery,
    setSearchQuery,
    totalPages,
    clearSearch,
  } = useQaTabs();

  return (
    <div className="w-full">
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />

        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="w-full pl-10 pr-10 py-3 border rounded-lg"
        />

        {searchQuery && (
          <button
            onClick={clearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <Tabs value={active} onValueChange={handleCategoryChange}>
        <TabsList className="!bg-transparent !p-0 !h-auto !w-full grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-10 mb-6 gap-2">
          {categoryData.map(category => (
            <TabsTrigger
              key={category.slug}
              value={category.slug}
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            >
              {category.translations[localeKey] ??
                category.translations.en ??
                category.slug}
            </TabsTrigger>
          ))}
        </TabsList>

        {categoryData.map(category => (
          <TabsContent key={category.slug} value={category.slug}>
            {isLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin h-8 w-8 border-b-2" />
              </div>
            ) : items.length ? (
              <AccordionList items={items} />
            ) : (
              <p className="text-center py-12">
                {debouncedSearch
                  ? t('noResults', { query: debouncedSearch })
                  : t('noQuestions')}
              </p>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {!isLoading && totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  );
}
