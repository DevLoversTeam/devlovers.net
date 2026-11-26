// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { QuizResultRow } from '@/components/dashboard/QuizResultRow';
import uk from '@/messages/uk.json';
import type { UserLastAttempt } from '@/types/quiz';

vi.mock('@/i18n/routing', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const attempt: UserLastAttempt = {
  attemptId: 'attempt',
  quizId: 'quiz',
  quizTitle: 'Git',
  quizSlug: 'git',
  categorySlug: null,
  categoryName: null,
  score: 10,
  totalQuestions: 10,
  percentage: 100,
  pointsEarned: 10,
  integrityScore: null,
  completedAt: new Date('2026-03-04T12:00:00Z'),
};

describe('quiz result status label', () => {
  it.each([
    [100, uk.quiz.status.mastered],
    [80, uk.dashboard.quizResults.needsReview],
    [60, uk.dashboard.quizResults.study],
  ])('renders the label for a score of %s percent', (percentage, label) => {
    render(
      <NextIntlClientProvider locale="uk" messages={uk} timeZone="UTC">
        <QuizResultRow attempt={{ ...attempt, percentage }} locale="uk" />
      </NextIntlClientProvider>
    );

    expect(screen.getAllByText(label)).toHaveLength(2);
  });
});
