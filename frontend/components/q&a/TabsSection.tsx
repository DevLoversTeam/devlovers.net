'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useParams } from 'next/navigation';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { Search, X } from 'lucide-react';

import AccordionList from '@/components/q&a/AccordionList';
import { Pagination } from '@/components/q&a/Pagination';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { categoryData } from '@/data/category';

const CATEGORY_SLUGS = categoryData.map(category => category.slug);
const DEFAULT_CATEGORY = CATEGORY_SLUGS[0] || 'html';
const DEBOUNCE_MS = 400;

interface PaginatedResponse {
  items: any[];
  total: number;
  page: number;
  totalPages: number;
}

export default function TabsSection() {
  const t = useTranslations('qa');
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();

  const locale = params.locale as string;
  const localeKey = (['uk', 'en', 'pl'] as const).includes(locale as 'uk' | 'en' | 'pl')
    ? (locale as 'uk' | 'en' | 'pl')
    : 'en';

  const pageFromUrl = Number(searchParams.get('page') || 1);
  const categoryFromUrl = searchParams.get('category') || DEFAULT_CATEGORY;
  const searchFromUrl = searchParams.get('search') || '';

  const [active, setActive] = useState(
    CATEGORY_SLUGS.includes(categoryFromUrl)
      ? categoryFromUrl
      : DEFAULT_CATEGORY
  );
  const [currentPage, setCurrentPage] = useState(pageFromUrl);
  const [searchQuery, setSearchQuery] = useState(searchFromUrl);
  const [debouncedSearch, setDebouncedSearch] = useState(searchFromUrl);
  const [items, setItems] = useState<any[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(false);

  const updateUrl = useCallback(
    (category: string, page: number, search: string) => {
      const params = new URLSearchParams();

      if (category !== DEFAULT_CATEGORY) params.set('category', category);
      if (page > 1) params.set('page', String(page));
      if (search) params.set('search', search);

      const queryString = params.toString();

      router.replace(`/q&a${queryString ? `?${queryString}` : ''}`, {
        scroll: false,
      });
    },
    [router]
  );

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
      updateUrl(active, 1, searchQuery);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, active, updateUrl]);

  useEffect(() => {
    async function load() {
      setIsLoading(true);

      try {
        const searchParam = debouncedSearch
          ? `&search=${encodeURIComponent(debouncedSearch)}`
          : '';

        const res = await fetch(
          `/api/questions/${active}?page=${currentPage}&limit=10&locale=${locale}${searchParam}`
        );

        const data: PaginatedResponse = await res.json();

        setItems(data.items);
        setTotalPages(data.totalPages);
      } catch (error) {
        console.error('Failed to load questions:', error);
        setItems([]);
        setTotalPages(0);
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, [active, currentPage, debouncedSearch, locale]);

  const handleCategoryChange = (category: string) => {
    setActive(category);
    setCurrentPage(1);
    setSearchQuery('');
    setDebouncedSearch('');
    updateUrl(category, 1, '');
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    updateUrl(active, page, debouncedSearch);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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
            onClick={() => {
              setSearchQuery('');
              setDebouncedSearch('');
              setCurrentPage(1);
              updateUrl(active, 1, '');
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <Tabs value={active} onValueChange={handleCategoryChange}>
        <TabsList className="grid grid-cols-10 mb-6">
          {categoryData.map(category => (
            <TabsTrigger key={category.slug} value={category.slug}>
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
