// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

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
    vi.stubGlobal('scrollTo', vi.fn());
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
    expect(window.scrollTo).toHaveBeenCalled();
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
    expect(result.current.totalPages).toBe(0);
    consoleSpy.mockRestore();
  });
});
