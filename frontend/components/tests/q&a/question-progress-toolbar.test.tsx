// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values ? `${key}:${Object.values(values).join('/')}` : key,
}));

import { QuestionProgressToolbar } from '@/components/q&a/QuestionProgressToolbar';

const defaultProps = {
  categoryLabel: 'Git',
  accentColor: '#ef233c',
  totalQuestions: 100,
  viewedCount: 3,
  bookmarkedCount: 2,
  filter: 'all' as const,
  isAuthenticated: true,
  onFilterChange: vi.fn(),
  onResetProgress: vi.fn().mockResolvedValue('saved' as const),
  onRetry: vi.fn().mockResolvedValue(undefined),
};

describe('QuestionProgressToolbar', () => {
  it('shows progress and changes the saved filter', () => {
    const onFilterChange = vi.fn();

    render(
      <QuestionProgressToolbar
        {...defaultProps}
        onFilterChange={onFilterChange}
      />
    );

    expect(screen.getByText('3/100')).toBeTruthy();
    expect(screen.getByText('bookmarkedCount:2')).toBeTruthy();

    fireEvent.click(screen.getByText('filters.bookmarked:2'));

    expect(onFilterChange).toHaveBeenCalledWith('bookmarked');
  });

  it('confirms progress reset in an accessible dialog', async () => {
    const onResetProgress = vi.fn().mockResolvedValue('saved');

    render(
      <QuestionProgressToolbar
        {...defaultProps}
        onResetProgress={onResetProgress}
      />
    );

    fireEvent.click(screen.getByText('resetProgress'));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('reset.title:Git')).toBeTruthy();
    expect(screen.getByText('reset.description:3/2')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText('reset.cancel')).toHaveFocus();
    });

    fireEvent.click(screen.getByText('reset.confirm'));

    await waitFor(() => {
      expect(onResetProgress).toHaveBeenCalledOnce();
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
  });

  it('hides account-only controls for guests', () => {
    render(
      <QuestionProgressToolbar {...defaultProps} isAuthenticated={false} />
    );

    expect(screen.queryByText('filters.bookmarked:2')).toBeNull();
    expect(screen.queryByText('resetProgress')).toBeNull();
  });

  it('announces sync errors and retries loading progress', () => {
    const onRetry = vi.fn().mockResolvedValue(undefined);

    render(
      <QuestionProgressToolbar
        {...defaultProps}
        error="load_failed"
        onRetry={onRetry}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('syncError.load');

    fireEvent.click(screen.getByRole('button', { name: 'syncError.retry' }));

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('keeps the reset dialog open and explains a failed reset', async () => {
    render(
      <QuestionProgressToolbar
        {...defaultProps}
        error="reset_failed"
        onResetProgress={vi.fn().mockResolvedValue('error')}
      />
    );

    fireEvent.click(screen.getByText('resetProgress'));
    fireEvent.click(screen.getByText('reset.confirm'));

    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeTruthy();
      expect(screen.getByRole('alert')).toHaveTextContent('syncError.reset');
    });
  });
});
