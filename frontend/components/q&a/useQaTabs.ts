'use client';

import { useState, useEffect, useCallback } from 'react';
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
  const [active, setActive] = useState<CategorySlug>(
    isCategorySlug(categoryFromUrl) ? categoryFromUrl : DEFAULT_CATEGORY
  );
  const [currentPage, setCurrentPage] = useState(safePageFromUrl);
  const [items, setItems] = useState<QuestionEntry[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const updateUrl = useCallback(
    (category: CategorySlug, page: number) => {
      const params = new URLSearchParams();

      if (category !== DEFAULT_CATEGORY) params.set('category', category);
      if (page > 1) params.set('page', String(page));

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
          `/api/questions/${active}?page=${currentPage}&limit=10&locale=${localeKey}`,
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
  }, [active, currentPage, localeKey]);

  const handleCategoryChange = useCallback(
    (category: string) => {
      if (!isCategorySlug(category)) {
        return;
      }
      setActive(category);
      setCurrentPage(1);
      updateUrl(category, 1);
    },
    [updateUrl]
  );

  const handlePageChange = useCallback(
    (page: number) => {
      setCurrentPage(page);
      updateUrl(active, page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [active, updateUrl]
  );

  return {
    active,
    currentPage,
    handleCategoryChange,
    handlePageChange,
    isLoading,
    items,
    localeKey,
    totalPages,
  };
}
