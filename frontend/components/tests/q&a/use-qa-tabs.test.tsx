// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routerReplace = vi.fn();
let searchParamsValue = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsValue,
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
}));

vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ replace: routerReplace }),
}));

import { useQaTabs } from '@/components/q&a/useQaTabs';

describe('useQaTabs', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'q1',
            categoryId: 'cat-1',
            sortOrder: 1,
            difficulty: null,
            question: 'Question 1',
            answerBlocks: [],
            locale: 'en',
          },
        ],
        total: 1,
        page: 1,
        totalPages: 1,
        locale: 'en',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    routerReplace.mockClear();
    searchParamsValue = new URLSearchParams();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads questions for default category', async () => {
    const { result } = renderHook(() => useQaTabs());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/questions/git?page=1&limit=10&locale=en',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(result.current.items).toHaveLength(1);
    expect(result.current.totalItems).toBe(1);
  });

  it('updates page and URL on page change', async () => {
    const { result } = renderHook(() => useQaTabs());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.handlePageChange(2);
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    expect(routerReplace).toHaveBeenCalledWith('/q&a?page=2', {
      scroll: false,
    });
  });

  it('updates category and URL on category change', async () => {
    const { result } = renderHook(() => useQaTabs());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.handleCategoryChange('css');
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    expect(routerReplace).toHaveBeenCalledWith('/q&a?category=css', {
      scroll: false,
    });
  });

  it('falls back to default category on invalid URL category', async () => {
    searchParamsValue = new URLSearchParams('category=invalid&page=2');

    const { result } = renderHook(() => useQaTabs());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/questions/git?page=2&limit=10&locale=en',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('handles fetch error by clearing items', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const { result } = renderHook(() => useQaTabs());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.items).toEqual([]);
    expect(result.current.totalItems).toBe(0);
    expect(result.current.totalPages).toBe(0);
    consoleSpy.mockRestore();
  });

  it('updates page size and URL on size change', async () => {
    const { result } = renderHook(() => useQaTabs());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.handlePageSizeChange(40);
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/questions/git?page=1&limit=40&locale=en',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    expect(routerReplace).toHaveBeenCalledWith('/q&a?size=40', {
      scroll: false,
    });
  });

  it('loads bookmarked questions from the URL filter', async () => {
    searchParamsValue = new URLSearchParams('filter=bookmarked');

    const { result } = renderHook(() => useQaTabs());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.filter).toBe('bookmarked');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/questions/git?page=1&limit=10&locale=en&filter=bookmarked',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('updates the URL and request when the filter changes', async () => {
    const { result } = renderHook(() => useQaTabs());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.handleFilterChange('bookmarked');
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/questions/git?page=1&limit=10&locale=en&filter=bookmarked',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    expect(routerReplace).toHaveBeenCalledWith('/q&a?filter=bookmarked', {
      scroll: false,
    });
  });

  it('loads and adopts the page containing a focused question', async () => {
    searchParamsValue = new URLSearchParams('category=git&question=q15');
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'q15',
            categoryId: 'cat-1',
            sortOrder: 15,
            difficulty: null,
            question: 'Question 15',
            answerBlocks: [],
            locale: 'en',
          },
        ],
        total: 25,
        page: 2,
        totalPages: 3,
        locale: 'en',
      }),
    });

    const { result } = renderHook(() => useQaTabs());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.currentPage).toBe(2);
    });

    expect(result.current.focusedQuestionId).toBe('q15');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/questions/git?page=1&limit=10&locale=en&question=q15',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
