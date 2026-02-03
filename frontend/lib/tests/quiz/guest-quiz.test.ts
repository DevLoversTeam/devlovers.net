// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearPendingQuizResult,
  getPendingQuizResult,
  savePendingQuizResult,
} from '@/lib/quiz/guest-quiz';

describe('guest-quiz storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saves pending quiz result to localStorage', () => {
    const result = {
      quizId: 'quiz-1',
      quizSlug: 'react',
      answers: [{ questionId: 'q1', selectedAnswerId: 'a1', isCorrect: true }],
      score: 1,
      totalQuestions: 1,
      percentage: 100,
      violations: [],
      timeSpentSeconds: 10,
      savedAt: Date.now(),
    };

    savePendingQuizResult(result);

    const stored = localStorage.getItem('devlovers_pending_quiz');
    expect(stored).not.toBeNull();
  });

  it('returns null and clears storage for expired result', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 25 * 60 * 60 * 1000);

    localStorage.setItem(
      'devlovers_pending_quiz',
      JSON.stringify({
        quizId: 'quiz-1',
        quizSlug: 'react',
        answers: [],
        score: 0,
        totalQuestions: 1,
        percentage: 0,
        violations: [],
        timeSpentSeconds: 0,
        savedAt: now,
      })
    );

    const result = getPendingQuizResult();

    expect(result).toBeNull();
    expect(localStorage.getItem('devlovers_pending_quiz')).toBeNull();
  });

  it('returns null and clears storage for invalid JSON', () => {
    localStorage.setItem('devlovers_pending_quiz', '{bad json');

    const result = getPendingQuizResult();

    expect(result).toBeNull();
    expect(localStorage.getItem('devlovers_pending_quiz')).toBeNull();
  });

  it('returns stored result when not expired', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const stored = {
      quizId: 'quiz-1',
      quizSlug: 'react',
      answers: [],
      score: 0,
      totalQuestions: 1,
      percentage: 0,
      violations: [],
      timeSpentSeconds: 0,
      savedAt: now,
    };

    localStorage.setItem('devlovers_pending_quiz', JSON.stringify(stored));

    const result = getPendingQuizResult();

    expect(result?.quizId).toBe('quiz-1');
  });

  it('clears pending quiz result', () => {
    localStorage.setItem(
      'devlovers_pending_quiz',
      JSON.stringify({ quizId: 'q1' })
    );

    clearPendingQuizResult();

    expect(localStorage.getItem('devlovers_pending_quiz')).toBeNull();
  });
});
