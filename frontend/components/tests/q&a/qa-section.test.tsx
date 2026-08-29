// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const qaState = {
  active: 'git',
  currentPage: 1,
  filter: 'all' as 'all' | 'bookmarked',
  focusedQuestionId: null as string | null,
  handleCategoryChange: vi.fn(),
  handleFilterChange: vi.fn(),
  handlePageChange: vi.fn(),
  handlePageSizeChange: vi.fn(),
  isLoading: false,
  items: [] as unknown[],
  localeKey: 'en',
  pageSize: 10,
  pageSizeOptions: [10, 20, 40],
  totalItems: 0,
  totalPages: 0,
};

vi.mock('@/components/q&a/useQaTabs', () => ({
  useQaTabs: () => qaState,
}));

const questionProgressState = {
  viewedItems: new Set<string>(),
  bookmarkedItems: new Set<string>(),
  viewedCount: 0,
  bookmarkedCount: 0,
  totalQuestions: 0,
  isAuthenticated: true,
  isLoading: false,
  markAsViewed: vi.fn(),
  toggleBookmark: vi.fn(),
  resetProgress: vi.fn(),
};

vi.mock('@/components/q&a/useQuestionProgress', () => ({
  useQuestionProgress: () => questionProgressState,
}));

vi.mock('@/components/q&a/QuestionProgressToolbar', () => ({
  QuestionProgressToolbar: () => <div data-testid="progress-toolbar" />,
}));

vi.mock('@/components/q&a/GuestProgressPrompt', () => ({
  GuestProgressPrompt: ({
    isOpen,
    returnTo,
    onClose,
  }: {
    isOpen: boolean;
    returnTo: string;
    onClose: () => void;
  }) =>
    isOpen ? (
      <div data-testid="guest-progress-prompt">
        {returnTo}
        <button onClick={onClose}>dismiss-guest-progress-prompt</button>
      </div>
    ) : null,
}));

vi.mock('@/components/q&a/AccordionList', () => ({
  __esModule: true,
  default: ({
    items,
    onQuestionOpened,
  }: {
    items: { id?: string }[];
    onQuestionOpened?: (questionId: string) => void;
  }) => (
    <div data-testid="accordion-list">
      {items.length}
      {items[0]?.id ? (
        <button onClick={() => onQuestionOpened?.(items[0].id!)}>
          open-question
        </button>
      ) : null}
    </div>
  ),
}));

vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  TabsContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@/components/q&a/Pagination', () => ({
  Pagination: () => <div data-testid="pagination" />,
}));

vi.mock('@/components/shared/CategoryTabButton', () => ({
  CategoryTabButton: ({ label }: { label: string }) => (
    <button data-testid="category-tab">{label}</button>
  ),
}));

import QaSection from '@/components/q&a/QaSection';
import { categoryData } from '@/data/category';

describe('QaSection', () => {
  beforeEach(() => {
    qaState.filter = 'all';
    qaState.focusedQuestionId = null;
    qaState.items = [];
    qaState.totalItems = 0;
    qaState.totalPages = 0;
    qaState.handleFilterChange.mockClear();
    questionProgressState.isAuthenticated = true;
    questionProgressState.isLoading = false;
    questionProgressState.markAsViewed.mockReset();
    questionProgressState.markAsViewed.mockResolvedValue('saved');
  });

  it('renders empty state when no questions', () => {
    qaState.totalPages = 0;
    render(<QaSection />);

    expect(screen.getAllByText('noQuestions').length).toBeGreaterThan(0);
  });

  it('renders category tabs and pagination', () => {
    qaState.totalPages = 3;
    qaState.items = [{ id: 'q1' }];
    qaState.totalItems = 42;
    render(<QaSection />);

    expect(screen.getAllByTestId('category-tab')).toHaveLength(
      categoryData.length
    );
    expect(screen.getByTestId('pagination')).toBeTruthy();
  });

  it('renders saved empty state and returns to all questions', () => {
    qaState.filter = 'bookmarked';

    render(<QaSection />);

    expect(screen.getAllByText('filters.emptyTitle').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText('filters.emptyDescription').length
    ).toBeGreaterThan(0);

    fireEvent.click(
      screen.getAllByRole('button', { name: 'filters.showAll' })[0]
    );

    expect(qaState.handleFilterChange).toHaveBeenCalledWith('all');
  });

  it('shows the save-progress prompt after a guest opens a question', async () => {
    window.history.replaceState({}, '', '/en/q&a?category=git');
    qaState.items = [{ id: 'q1' }];
    qaState.totalItems = 1;
    questionProgressState.isAuthenticated = false;
    questionProgressState.markAsViewed.mockResolvedValue('unauthenticated');

    render(<QaSection />);

    fireEvent.click(
      screen.getAllByRole('button', { name: 'open-question' })[0]
    );

    await waitFor(() => {
      expect(screen.getByTestId('guest-progress-prompt')).toHaveTextContent(
        '/en/q&a?category=git'
      );
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'dismiss-guest-progress-prompt' })
    );
    fireEvent.click(
      screen.getAllByRole('button', { name: 'open-question' })[0]
    );

    expect(screen.queryByTestId('guest-progress-prompt')).toBeNull();
  });

  it('waits for the auth check before showing the guest prompt', async () => {
    qaState.items = [{ id: 'q1' }];
    qaState.totalItems = 1;
    questionProgressState.isAuthenticated = false;
    questionProgressState.isLoading = true;
    questionProgressState.markAsViewed.mockResolvedValue('unauthenticated');

    const { rerender } = render(<QaSection />);

    fireEvent.click(
      screen.getAllByRole('button', { name: 'open-question' })[0]
    );

    await waitFor(() => {
      expect(questionProgressState.markAsViewed).toHaveBeenCalledWith('q1');
    });
    expect(screen.queryByTestId('guest-progress-prompt')).toBeNull();

    questionProgressState.isLoading = false;
    rerender(<QaSection />);

    expect(screen.getByTestId('guest-progress-prompt')).toBeTruthy();
  });
});
