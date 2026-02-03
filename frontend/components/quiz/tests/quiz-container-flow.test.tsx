// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { routerReplace, routerBack, toastMock } = vi.hoisted(() => ({
  routerReplace: vi.fn(),
  routerBack: vi.fn(),
  toastMock: Object.assign(vi.fn(), { error: vi.fn() }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace, back: routerBack }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('sonner', () => ({ toast: toastMock }));

vi.mock('@/hooks/useAntiCheat', () => ({
  useAntiCheat: () => ({
    violations: [],
    violationsCount: 0,
    resetViolations: vi.fn(),
  }),
}));

vi.mock('@/hooks/useQuizGuards', () => ({
  useQuizGuards: () => ({ markQuitting: vi.fn() }),
}));

vi.mock('@/hooks/useQuizSession', () => ({
  useQuizSession: () => {},
}));

vi.mock('@/components/quiz/CountdownTimer', () => ({
  CountdownTimer: () => null,
}));

vi.mock('@/actions/quiz', () => ({
  submitQuizAttempt: vi.fn(async () => ({ success: true, pointsAwarded: 10 })),
}));

import { QuizContainer } from '@/components/quiz/QuizContainer';

describe('QuizContainer flow', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ isCorrect: true }),
    });
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('runs a guest flow from rules to result', async () => {
    const questions = [
      {
        id: 'q1',
        displayOrder: 1,
        difficulty: null,
        questionText: 'Question 1',
        explanation: null,
        answers: [
          { id: 'a1', displayOrder: 1, answerText: 'Answer 1' },
          { id: 'a2', displayOrder: 2, answerText: 'Answer 2' },
        ],
      },
    ];

    render(
      <QuizContainer
        quizId="quiz-1"
        quizSlug="quiz-1"
        questions={questions}
        encryptedAnswers="encrypted"
        userId={null}
        timeLimitSeconds={60}
        seed={123}
        categorySlug="react"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'startButton' }));

    expect(await screen.findByText('Question 1')).toBeTruthy();

    fireEvent.click(screen.getByText('Answer 1'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [url, options] = fetchMock.mock.calls[0];
    const payload = JSON.parse(options.body);

    expect(url).toBe('/api/quiz/verify-answer');
    expect(payload.questionId).toBe('q1');
    expect(payload.answerId).toBe('a1');
    expect(payload.encryptedAnswers).toBe('encrypted');

    fireEvent.click(await screen.findByRole('button', { name: 'nextButton' }));

    expect(
      await screen.findByRole('button', { name: 'loginButton' })
    ).toBeTruthy();
  });
});
