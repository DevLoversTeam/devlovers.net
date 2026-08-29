// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authState = {
  loading: false,
  refresh: vi.fn(async () => undefined),
  userExists: true,
};

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => authState,
}));

import { useQuestionProgress } from '@/components/q&a/useQuestionProgress';

const emptyProgress = {
  totalQuestions: 100,
  viewedCount: 0,
  bookmarkedCount: 0,
  viewedQuestionIds: [],
  bookmarkedQuestionIds: [],
  lastOpenedQuestionId: null,
  items: [],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('useQuestionProgress', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    authState.loading = false;
    authState.userExists = true;
    authState.refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('does not load or persist progress for guests', async () => {
    authState.userExists = false;
    const { result } = renderHook(() => useQuestionProgress('git'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetch).not.toHaveBeenCalled();
    await expect(result.current.markAsViewed('q1')).resolves.toBe(
      'unauthenticated'
    );
    expect(result.current.viewedItems.size).toBe(0);
  });

  it('loads category progress from the authenticated API', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        progress: {
          ...emptyProgress,
          viewedCount: 1,
          bookmarkedCount: 1,
          viewedQuestionIds: ['q1'],
          bookmarkedQuestionIds: ['q1'],
          lastOpenedQuestionId: 'q1',
        },
      })
    );

    const { result } = renderHook(() => useQuestionProgress('git'));

    await waitFor(() =>
      expect(result.current.viewedItems.has('q1')).toBe(true)
    );

    expect(result.current.bookmarkedItems.has('q1')).toBe(true);
    expect(result.current.viewedCount).toBe(1);
    expect(fetch).toHaveBeenCalledWith(
      '/api/question-progress?category=git',
      expect.objectContaining({ method: 'GET', credentials: 'include' })
    );
  });

  it('clears a load error after a successful retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ code: 'INTERNAL_ERROR' }, 500))
      .mockResolvedValueOnce(jsonResponse({ progress: emptyProgress }));

    const { result } = renderHook(() => useQuestionProgress('git'));

    await waitFor(() => expect(result.current.error).toBe('load_failed'));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('optimistically marks viewed and rolls back a failed mutation', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ progress: emptyProgress })
    );
    const { result } = renderHook(() => useQuestionProgress('git'));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    let resolveMutation!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>(resolve => {
          resolveMutation = resolve;
        })
    );

    let mutation!: Promise<string>;
    act(() => {
      mutation = result.current.markAsViewed('q1');
    });

    expect(result.current.viewedItems.has('q1')).toBe(true);

    await act(async () => {
      resolveMutation(jsonResponse({ code: 'INTERNAL_ERROR' }, 500));
      await mutation;
    });

    expect(result.current.viewedItems.has('q1')).toBe(false);
    expect(result.current.error).toBe('save_failed');
  });

  it('sends the desired bookmark state and keeps optimistic success', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          progress: {
            ...emptyProgress,
            viewedCount: 1,
            viewedQuestionIds: ['q1'],
          },
        })
      )
      .mockResolvedValueOnce(jsonResponse({ success: true }));

    const { result } = renderHook(() => useQuestionProgress('git'));
    await waitFor(() =>
      expect(result.current.viewedItems.has('q1')).toBe(true)
    );

    await act(async () => {
      await result.current.toggleBookmark('q1');
    });

    expect(result.current.bookmarkedItems.has('q1')).toBe(true);
    const mutationRequest = vi.mocked(fetch).mock.calls[1];
    expect(mutationRequest?.[0]).toBe('/api/question-progress/q1');
    expect(JSON.parse(String(mutationRequest?.[1]?.body))).toEqual({
      bookmarked: true,
    });
  });

  it('optimistically resets viewed state but preserves bookmarks', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          progress: {
            ...emptyProgress,
            viewedCount: 2,
            bookmarkedCount: 1,
            viewedQuestionIds: ['q1', 'q2'],
            bookmarkedQuestionIds: ['q2'],
            lastOpenedQuestionId: 'q2',
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          progress: {
            ...emptyProgress,
            bookmarkedCount: 1,
            bookmarkedQuestionIds: ['q2'],
          },
        })
      );

    const { result } = renderHook(() => useQuestionProgress('git'));
    await waitFor(() => expect(result.current.viewedCount).toBe(2));

    await act(async () => {
      await result.current.resetProgress();
    });

    expect(result.current.viewedCount).toBe(0);
    expect(result.current.bookmarkedItems.has('q2')).toBe(true);
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/question-progress?category=git',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});
