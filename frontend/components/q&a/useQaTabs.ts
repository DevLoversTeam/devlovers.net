'use client';

import { useSearchParams } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import {
  type CategorySlug,
  type Locale,
  type PaginatedResponse,
  type QuestionApiItem,
  type QuestionEntry,
} from '@/components/q&a/types';
import { categoryData } from '@/data/category';
import { useRouter } from '@/i18n/routing';

const CATEGORY_SLUGS = categoryData.map(category => category.slug);
const DEFAULT_CATEGORY = CATEGORY_SLUGS[0] || 'html';
const PAGE_SIZE_OPTIONS = [10, 20, 40, 60, 80, 100] as const;
const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];
type QaPageSize = (typeof PAGE_SIZE_OPTIONS)[number];

function isCategorySlug(value: string): value is CategorySlug {
  return CATEGORY_SLUGS.includes(value);
}

function isQaPageSize(value: number): value is QaPageSize {
  return PAGE_SIZE_OPTIONS.includes(value as QaPageSize);
}

export function useQaTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const localeKey = useLocale() as Locale;

  const rawPage = searchParams.get('page');
  const pageFromUrl = rawPage ? Number(rawPage) : 1;
  const safePageFromUrl =
    Number.isFinite(pageFromUrl) && pageFromUrl > 0 ? pageFromUrl : 1;
  const rawSize = searchParams.get('size');
  const parsedSize = rawSize ? Number(rawSize) : DEFAULT_PAGE_SIZE;
  const safePageSizeFromUrl = isQaPageSize(parsedSize)
    ? parsedSize
    : DEFAULT_PAGE_SIZE;
  const categoryFromUrl = searchParams.get('category') || DEFAULT_CATEGORY;
  const [active, setActive] = useState<CategorySlug>(
    isCategorySlug(categoryFromUrl) ? categoryFromUrl : DEFAULT_CATEGORY
  );
  const [currentPage, setCurrentPage] = useState(safePageFromUrl);
  const [pageSize, setPageSize] = useState<QaPageSize>(safePageSizeFromUrl);
  const [items, setItems] = useState<QuestionEntry[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const updateUrl = useCallback(
    (category: CategorySlug, page: number, size: QaPageSize) => {
      const params = new URLSearchParams();

      if (category !== DEFAULT_CATEGORY) params.set('category', category);
      if (page > 1) params.set('page', String(page));
      if (size !== DEFAULT_PAGE_SIZE) params.set('size', String(size));

      const queryString = params.toString();

      router.replace(`/q&a${queryString ? `?${queryString}` : ''}`, {
        scroll: false,
      });
    },
    [router]
  );

  useEffect(() => {
    setCurrentPage(safePageFromUrl);
  }, [safePageFromUrl]);

  useEffect(() => {
    setPageSize(safePageSizeFromUrl);
  }, [safePageSizeFromUrl]);

  useEffect(() => {
    if (!isCategorySlug(categoryFromUrl)) {
      return;
    }
    setActive(categoryFromUrl);
  }, [categoryFromUrl]);

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();

    async function load() {
      setIsLoading(true);

      try {
        const res = await fetch(
          `/api/questions/${active}?page=${currentPage}&limit=${pageSize}&locale=${localeKey}`,
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
        if (!isActive || controller.signal.aborted) {
          return;
        }
        console.error('Failed to load questions:', error);
        setItems([]);
        setTotalPages(0);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    load();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [active, currentPage, localeKey, pageSize]);

  const handleCategoryChange = useCallback(
    (category: string) => {
      if (!isCategorySlug(category)) {
        return;
      }
      setActive(category);
      setCurrentPage(1);
      updateUrl(category, 1, pageSize);
    },
    [pageSize, updateUrl]
  );

  const handlePageChange = useCallback(
    (page: number) => {
      setCurrentPage(page);
      updateUrl(active, page, pageSize);
    },
    [active, pageSize, updateUrl]
  );

  const handlePageSizeChange = useCallback(
    (size: number) => {
      if (!isQaPageSize(size)) {
        return;
      }

      setPageSize(size);
      setCurrentPage(1);
      updateUrl(active, 1, size);
    },
    [active, updateUrl]
  );

  return {
    active,
    currentPage,
    handleCategoryChange,
    handlePageChange,
    handlePageSizeChange,
    isLoading,
    items,
    localeKey,
    pageSize,
    pageSizeOptions: PAGE_SIZE_OPTIONS,
    totalPages,
  };
}
