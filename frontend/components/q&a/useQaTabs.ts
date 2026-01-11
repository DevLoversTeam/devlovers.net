'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useParams } from 'next/navigation';
import { useRouter } from '@/i18n/routing';
import { categoryData } from '@/data/category';
import {
  qaConstants,
  type CategorySlug,
  type Locale,
  type PaginatedResponse,
  type QuestionApiItem,
  type QuestionEntry,
} from '@/components/q&a/types';

const CATEGORY_SLUGS = categoryData.map(category => category.slug);
const DEFAULT_CATEGORY = CATEGORY_SLUGS[0] || 'html';
const DEBOUNCE_MS = 400;

function resolveLocale(value: string): Locale {
  return qaConstants.supportedLocales.includes(value as Locale)
    ? (value as Locale)
    : 'en';
}

function isCategorySlug(value: string): value is CategorySlug {
  return CATEGORY_SLUGS.includes(value);
}

export function useQaTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();

  const locale =
    typeof params.locale === 'string' ? params.locale : params.locale?.[0] ?? '';
  const localeKey = resolveLocale(locale);

  const rawPage = searchParams.get('page');
  const pageFromUrl = rawPage ? Number(rawPage) : 1;
  const safePageFromUrl =
    Number.isFinite(pageFromUrl) && pageFromUrl > 0 ? pageFromUrl : 1;
  const categoryFromUrl = searchParams.get('category') || DEFAULT_CATEGORY;
  const searchFromUrl = searchParams.get('search') || '';

  const [active, setActive] = useState<CategorySlug>(
    isCategorySlug(categoryFromUrl) ? categoryFromUrl : DEFAULT_CATEGORY
  );
  const [currentPage, setCurrentPage] = useState(safePageFromUrl);
  const [searchQuery, setSearchQuery] = useState(searchFromUrl);
  const [debouncedSearch, setDebouncedSearch] = useState(searchFromUrl);
  const [items, setItems] = useState<QuestionEntry[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  const updateUrl = useCallback(
    (category: CategorySlug, page: number, search: string) => {
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
    const controller = new AbortController();

    async function load() {
      setIsLoading(true);

      try {
        const searchParam = debouncedSearch
          ? `&search=${encodeURIComponent(debouncedSearch)}`
          : '';

        const res = await fetch(
          `/api/questions/${active}?page=${currentPage}&limit=10&locale=${localeKey}${searchParam}`,
          { signal: controller.signal }
        );

        if (!res.ok) {
          throw new Error(`Failed to load questions: ${res.status}`);
        }

        const data: PaginatedResponse<QuestionApiItem> = await res.json();

        setItems(
          data.items.map(item => ({
            id: item.id,
            question: item.question,
            category: active,
            answerBlocks: item.answerBlocks,
          }))
        );
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
    return () => {
      controller.abort();
    };
  }, [active, currentPage, debouncedSearch, localeKey]);

  const handleCategoryChange = useCallback(
    (category: string) => {
      if (!isCategorySlug(category)) {
        return;
      }
      setActive(category);
      setCurrentPage(1);
      setSearchQuery('');
      setDebouncedSearch('');
      updateUrl(category, 1, '');
    },
    [updateUrl]
  );

  const handlePageChange = useCallback(
    (page: number) => {
      setCurrentPage(page);
      updateUrl(active, page, debouncedSearch);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [active, debouncedSearch, updateUrl]
  );

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setDebouncedSearch('');
    setCurrentPage(1);
    updateUrl(active, 1, '');
  }, [active, updateUrl]);

  return {
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
  };
}
