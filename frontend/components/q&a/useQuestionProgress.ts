'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';

type ProgressApiItem = {
  questionId: string;
  viewedAt: string | null;
  bookmarkedAt: string | null;
  lastOpenedAt: string | null;
  updatedAt: string;
};

type ProgressApiSnapshot = {
  totalQuestions: number;
  viewedCount: number;
  bookmarkedCount: number;
  viewedQuestionIds: string[];
  bookmarkedQuestionIds: string[];
  lastOpenedQuestionId: string | null;
  items: ProgressApiItem[];
};

type ProgressState = {
  category: string;
  viewedItems: Set<string>;
  bookmarkedItems: Set<string>;
  lastOpenedQuestionId: string | null;
};

export type ProgressMutationResult = 'saved' | 'unauthenticated' | 'error';

const EMPTY_SET = new Set<string>();

function stateFromApi(
  category: string,
  progress: ProgressApiSnapshot
): ProgressState {
  return {
    category,
    viewedItems: new Set(progress.viewedQuestionIds),
    bookmarkedItems: new Set(progress.bookmarkedQuestionIds),
    lastOpenedQuestionId: progress.lastOpenedQuestionId,
  };
}

export function useQuestionProgress(category: string) {
  const { loading: authLoading, refresh: refreshAuth, userExists } = useAuth();
  const [state, setState] = useState<ProgressState>({
    category,
    viewedItems: new Set(),
    bookmarkedItems: new Set(),
    lastOpenedQuestionId: null,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef(state);

  const updateState = useCallback(
    (updater: (previous: ProgressState) => ProgressState) => {
      setState(previous => {
        const next = updater(previous);
        stateRef.current = next;
        return next;
      });
    },
    []
  );

  const clearForCategory = useCallback(() => {
    updateState(() => ({
      category,
      viewedItems: new Set(),
      bookmarkedItems: new Set(),
      lastOpenedQuestionId: null,
    }));
  }, [category, updateState]);

  const handleUnauthorized = useCallback(async () => {
    clearForCategory();
    await refreshAuth();
  }, [clearForCategory, refreshAuth]);

  const loadProgress = useCallback(
    async (signal?: AbortSignal) => {
      if (authLoading) return;

      if (!userExists) {
        clearForCategory();
        setIsLoading(false);
        setError(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/question-progress?category=${encodeURIComponent(category)}`,
          {
            method: 'GET',
            cache: 'no-store',
            credentials: 'include',
            signal,
          }
        );

        if (response.status === 401) {
          await handleUnauthorized();
          return;
        }

        if (!response.ok) {
          throw new Error(
            `Failed to load question progress (${response.status})`
          );
        }

        const body = (await response.json()) as {
          progress: ProgressApiSnapshot;
        };

        updateState(() => stateFromApi(category, body.progress));
      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name === 'AbortError'
        ) {
          return;
        }

        console.error('Failed to load Q&A progress:', loadError);
        setError('load_failed');
      } finally {
        if (!signal?.aborted) setIsLoading(false);
      }
    },
    [
      authLoading,
      category,
      clearForCategory,
      handleUnauthorized,
      updateState,
      userExists,
    ]
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadProgress(controller.signal);
    return () => controller.abort();
  }, [loadProgress]);

  const markAsViewed = useCallback(
    async (questionId: string): Promise<ProgressMutationResult> => {
      if (authLoading || !userExists) return 'unauthenticated';

      const mutationCategory = category;
      const wasViewed =
        stateRef.current.category === mutationCategory &&
        stateRef.current.viewedItems.has(questionId);
      const previousLastOpenedQuestionId =
        stateRef.current.category === mutationCategory
          ? stateRef.current.lastOpenedQuestionId
          : null;

      updateState(previous => {
        const base =
          previous.category === mutationCategory
            ? previous
            : {
                category: mutationCategory,
                viewedItems: new Set<string>(),
                bookmarkedItems: new Set<string>(),
                lastOpenedQuestionId: null,
              };
        const viewedItems = new Set(base.viewedItems);
        viewedItems.add(questionId);
        return {
          ...base,
          viewedItems,
          lastOpenedQuestionId: questionId,
        };
      });

      try {
        const response = await fetch(`/api/question-progress/${questionId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ viewed: true }),
        });

        if (response.status === 401) {
          await handleUnauthorized();
          return 'unauthenticated';
        }

        if (!response.ok) {
          throw new Error(`Failed to save viewed state (${response.status})`);
        }

        setError(null);
        return 'saved';
      } catch (mutationError) {
        console.error('Failed to save viewed Q&A question:', mutationError);
        setError('save_failed');

        updateState(previous => {
          if (previous.category !== mutationCategory) return previous;

          const viewedItems = new Set(previous.viewedItems);
          if (!wasViewed) viewedItems.delete(questionId);
          return {
            ...previous,
            viewedItems,
            lastOpenedQuestionId:
              previous.lastOpenedQuestionId === questionId
                ? previousLastOpenedQuestionId
                : previous.lastOpenedQuestionId,
          };
        });

        return 'error';
      }
    },
    [authLoading, category, handleUnauthorized, updateState, userExists]
  );

  const toggleBookmark = useCallback(
    async (questionId: string): Promise<ProgressMutationResult> => {
      if (authLoading || !userExists) return 'unauthenticated';

      const mutationCategory = category;
      const wasBookmarked =
        stateRef.current.category === mutationCategory &&
        stateRef.current.bookmarkedItems.has(questionId);
      const bookmarked = !wasBookmarked;

      updateState(previous => {
        if (previous.category !== mutationCategory) return previous;
        const bookmarkedItems = new Set(previous.bookmarkedItems);
        if (bookmarked) bookmarkedItems.add(questionId);
        else bookmarkedItems.delete(questionId);
        return { ...previous, bookmarkedItems };
      });

      try {
        const response = await fetch(`/api/question-progress/${questionId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ bookmarked }),
        });

        if (response.status === 401) {
          await handleUnauthorized();
          return 'unauthenticated';
        }

        if (!response.ok) {
          throw new Error(`Failed to save bookmark (${response.status})`);
        }

        setError(null);
        return 'saved';
      } catch (mutationError) {
        console.error('Failed to save Q&A bookmark:', mutationError);
        setError('save_failed');

        updateState(previous => {
          if (previous.category !== mutationCategory) return previous;
          const bookmarkedItems = new Set(previous.bookmarkedItems);
          if (wasBookmarked) bookmarkedItems.add(questionId);
          else bookmarkedItems.delete(questionId);
          return { ...previous, bookmarkedItems };
        });

        return 'error';
      }
    },
    [authLoading, category, handleUnauthorized, updateState, userExists]
  );

  const resetProgress =
    useCallback(async (): Promise<ProgressMutationResult> => {
      if (authLoading || !userExists) return 'unauthenticated';

      const mutationCategory = category;
      const previousState = stateRef.current;

      updateState(previous => {
        if (previous.category !== mutationCategory) return previous;
        return {
          ...previous,
          viewedItems: new Set(),
          lastOpenedQuestionId: null,
        };
      });

      try {
        const response = await fetch(
          `/api/question-progress?category=${encodeURIComponent(category)}`,
          {
            method: 'DELETE',
            credentials: 'include',
          }
        );

        if (response.status === 401) {
          await handleUnauthorized();
          return 'unauthenticated';
        }

        if (!response.ok) {
          throw new Error(
            `Failed to reset question progress (${response.status})`
          );
        }

        const body = (await response.json()) as {
          progress: ProgressApiSnapshot;
        };
        updateState(() => stateFromApi(category, body.progress));
        setError(null);
        return 'saved';
      } catch (mutationError) {
        console.error('Failed to reset Q&A progress:', mutationError);
        setError('reset_failed');
        updateState(current =>
          current.category === mutationCategory ? previousState : current
        );
        return 'error';
      }
    }, [authLoading, category, handleUnauthorized, updateState, userExists]);

  const visibleState = state.category === category ? state : null;
  const viewedItems = visibleState?.viewedItems ?? EMPTY_SET;
  const bookmarkedItems = visibleState?.bookmarkedItems ?? EMPTY_SET;

  return useMemo(
    () => ({
      viewedItems,
      bookmarkedItems,
      viewedCount: viewedItems.size,
      bookmarkedCount: bookmarkedItems.size,
      lastOpenedQuestionId: visibleState?.lastOpenedQuestionId ?? null,
      isAuthenticated: userExists,
      isLoading: authLoading || isLoading,
      error,
      markAsViewed,
      toggleBookmark,
      resetProgress,
      refresh: loadProgress,
    }),
    [
      authLoading,
      bookmarkedItems,
      error,
      isLoading,
      loadProgress,
      markAsViewed,
      resetProgress,
      toggleBookmark,
      userExists,
      viewedItems,
      visibleState?.lastOpenedQuestionId,
    ]
  );
}
