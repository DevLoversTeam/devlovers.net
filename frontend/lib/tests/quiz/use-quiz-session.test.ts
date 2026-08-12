// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  pointsAwarded: number | null;
  attemptId: string | null;
  isIncomplete: boolean;
};

const createState = (overrides: Partial<QuizState> = {}): QuizState => ({
  status: 'rules',
  currentIndex: 0,
  answers: [],
  questionStatus: 'answering',
  selectedAnswerId: null,
  startedAt: null,
  pointsAwarded: null,
  attemptId: null,
  isIncomplete: false,
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

  it('keeps saved session and consumes reload flag', async () => {
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

    renderHook(() => useQuizSession({ quizId, state: createState() }));

    expect(clearMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(reloadKey)).toBeNull();
  });

  it('keeps saved session and consumes allow-restore flag', async () => {
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

    renderHook(() => useQuizSession({ quizId, state: createState() }));

    expect(clearMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(QUIZ_ALLOW_RESTORE_KEY)).toBeNull();
  });

  it('clears saved session when restore is not allowed', async () => {
    loadMock.mockReturnValue({
      status: 'in_progress',
      currentIndex: 0,
      answers: [],
      questionStatus: 'answering',
      selectedAnswerId: null,
      startedAt: null,
      savedAt: Date.now(),
    });

    renderHook(() => useQuizSession({ quizId, state: createState() }));

    await waitFor(() => expect(clearMock).toHaveBeenCalledWith(quizId));
  });

  it('does nothing when no saved session exists', async () => {
    loadMock.mockReturnValue(null);

    renderHook(() => useQuizSession({ quizId, state: createState() }));

    await waitFor(() => {
      expect(clearMock).not.toHaveBeenCalled();
    });
  });

  it('saves session when status is in_progress', async () => {
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

    renderHook(() => useQuizSession({ quizId, state }));

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
    renderHook(() => useQuizSession({ quizId, state: createState() }));

    await waitFor(() => expect(saveMock).not.toHaveBeenCalled());
  });
});
