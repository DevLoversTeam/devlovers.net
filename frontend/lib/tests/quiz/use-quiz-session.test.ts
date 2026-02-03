// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useQuizSession } from '@/hooks/useQuizSession';
import {
  getQuizReloadKey,
  QUIZ_ALLOW_RESTORE_KEY,
} from '@/lib/quiz/quiz-storage-keys';

vi.mock('@/lib/quiz/quiz-session', () => ({
  saveQuizSession: vi.fn(),
  loadQuizSession: vi.fn(),
  clearQuizSession: vi.fn(),
}));

import {
  clearQuizSession,
  loadQuizSession,
  saveQuizSession,
} from '@/lib/quiz/quiz-session';

type QuizState = {
  status: 'rules' | 'in_progress' | 'completed';
  currentIndex: number;
  answers: Array<{
    questionId: string;
    selectedAnswerId: string;
    isCorrect: boolean;
    answeredAt: Date;
  }>;
  questionStatus: 'answering' | 'revealed';
  selectedAnswerId: string | null;
  startedAt: Date | null;
};

const createState = (overrides: Partial<QuizState> = {}): QuizState => ({
  status: 'rules',
  currentIndex: 0,
  answers: [],
  questionStatus: 'answering',
  selectedAnswerId: null,
  startedAt: null,
  ...overrides,
});

describe('useQuizSession', () => {
  const quizId = 'quiz-1';

  const loadMock = loadQuizSession as ReturnType<typeof vi.fn>;
  const saveMock = saveQuizSession as ReturnType<typeof vi.fn>;
  const clearMock = clearQuizSession as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it('restores session on reload', async () => {
    const onRestore = vi.fn();
    const reloadKey = getQuizReloadKey(quizId);

    sessionStorage.setItem(reloadKey, '1');
    loadMock.mockReturnValue({
      status: 'in_progress',
      currentIndex: 1,
      answers: [],
      questionStatus: 'answering',
      selectedAnswerId: null,
      startedAt: null,
      savedAt: Date.now(),
    });

    renderHook(() =>
      useQuizSession({ quizId, state: createState(), onRestore })
    );

    await waitFor(() => expect(onRestore).toHaveBeenCalledTimes(1));
    expect(clearMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(reloadKey)).toBeNull();
  });

  it('restores session when allow-restore flag is set', async () => {
    const onRestore = vi.fn();

    sessionStorage.setItem(QUIZ_ALLOW_RESTORE_KEY, '1');
    loadMock.mockReturnValue({
      status: 'in_progress',
      currentIndex: 0,
      answers: [],
      questionStatus: 'answering',
      selectedAnswerId: null,
      startedAt: null,
      savedAt: Date.now(),
    });

    renderHook(() =>
      useQuizSession({ quizId, state: createState(), onRestore })
    );

    await waitFor(() => expect(onRestore).toHaveBeenCalledTimes(1));
    expect(clearMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(QUIZ_ALLOW_RESTORE_KEY)).toBeNull();
  });

  it('clears saved session when restore is not allowed', async () => {
    const onRestore = vi.fn();

    loadMock.mockReturnValue({
      status: 'in_progress',
      currentIndex: 0,
      answers: [],
      questionStatus: 'answering',
      selectedAnswerId: null,
      startedAt: null,
      savedAt: Date.now(),
    });

    renderHook(() =>
      useQuizSession({ quizId, state: createState(), onRestore })
    );

    await waitFor(() => expect(clearMock).toHaveBeenCalledWith(quizId));
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('does nothing when no saved session exists', async () => {
    const onRestore = vi.fn();

    loadMock.mockReturnValue(null);

    renderHook(() =>
      useQuizSession({ quizId, state: createState(), onRestore })
    );

    await waitFor(() => {
      expect(onRestore).not.toHaveBeenCalled();
      expect(clearMock).not.toHaveBeenCalled();
    });
  });

  it('saves session when status is in_progress', async () => {
    const onRestore = vi.fn();
    const startedAt = new Date('2026-01-25T12:00:00Z');
    const answeredAt = new Date('2026-01-25T12:00:10Z');

    const state = createState({
      status: 'in_progress',
      currentIndex: 0,
      questionStatus: 'revealed',
      selectedAnswerId: 'a1',
      startedAt,
      answers: [
        {
          questionId: 'q1',
          selectedAnswerId: 'a1',
          isCorrect: true,
          answeredAt,
        },
      ],
    });

    renderHook(() => useQuizSession({ quizId, state, onRestore }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));

    const [calledQuizId, payload] = saveMock.mock.calls[0];

    expect(calledQuizId).toBe(quizId);
    expect(payload).toEqual(
      expect.objectContaining({
        status: 'in_progress',
        currentIndex: 0,
        questionStatus: 'revealed',
        selectedAnswerId: 'a1',
        startedAt: startedAt.getTime(),
        savedAt: expect.any(Number),
      })
    );
    expect(payload.answers).toEqual([
      {
        questionId: 'q1',
        selectedAnswerId: 'a1',
        isCorrect: true,
        answeredAt: answeredAt.getTime(),
      },
    ]);
  });

  it('does not save session when status is not in_progress', async () => {
    const onRestore = vi.fn();

    renderHook(() =>
      useQuizSession({ quizId, state: createState(), onRestore })
    );

    await waitFor(() => expect(saveMock).not.toHaveBeenCalled());
  });
});
