'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import AccordionList from '@/components/shared/AccordionList';
import { Pagination } from '@/components/shared/Pagination';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const categories = ['react', 'vue', 'angular', 'javascript', 'nextjs'];
const DEBOUNCE_MS = 400;

interface PaginatedResponse {
  items: any[];
  total: number;
  page: number;
  totalPages: number;
}

export default function TabsSection() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const pageFromUrl = parseInt(searchParams.get('page') || '1', 10);
  const categoryFromUrl = searchParams.get('category') || 'react';
  const searchFromUrl = searchParams.get('search') || '';

  const [active, setActive] = useState(
    categories.includes(categoryFromUrl) ? categoryFromUrl : 'react'
  );
  const [currentPage, setCurrentPage] = useState(pageFromUrl);
  const [searchQuery, setSearchQuery] = useState(searchFromUrl);
  const [debouncedSearch, setDebouncedSearch] = useState(searchFromUrl);
  const [items, setItems] = useState<any[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const updateUrl = useCallback(
    (category: string, page: number, search: string) => {
      const params = new URLSearchParams();
      if (category !== 'react') {
        params.set('category', category);
      }
      if (page > 1) {
        params.set('page', String(page));
      }
      if (search) {
        params.set('search', search);
      }
      const queryString = params.toString();
      router.push(`/q&a${queryString ? `?${queryString}` : ''}`, {
        scroll: false,
      });
    },
    [router]
  );

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
      updateUrl(active, 1, searchQuery);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery]);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const searchParam = debouncedSearch
          ? `&search=${encodeURIComponent(debouncedSearch)}`
          : '';
        const res = await fetch(
          `/api/questions/${active}?page=${currentPage}&limit=10${searchParam}`
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
  }, [active, currentPage, debouncedSearch]);

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

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setDebouncedSearch('');
    setCurrentPage(1);
    updateUrl(active, 1, '');
  };

  return (
    <div className="w-full">
      <div className="relative mb-6">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={handleSearchChange}
          placeholder="Пошук..."
          className="block w-full pl-10 pr-10 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
        />
        {searchQuery && (
          <button
            onClick={handleClearSearch}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label="Очистити пошук"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <Tabs
        value={active}
        onValueChange={handleCategoryChange}
        className="w-full"
      >
        <TabsList className="grid grid-cols-5 mb-6">
          {categories.map(c => (
            <TabsTrigger key={c} value={c} className="capitalize">
              {c}
            </TabsTrigger>
          ))}
        </TabsList>

        {categories.map(c => (
          <TabsContent key={c} value={c}>
            {isLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : items.length > 0 ? (
              <AccordionList items={items} />
            ) : (
              <p className="text-center py-12 text-gray-500 dark:text-gray-400">
                {debouncedSearch
                  ? `Нічого не знайдено за запитом "${debouncedSearch}"`
                  : 'Питань не знайдено'}
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
