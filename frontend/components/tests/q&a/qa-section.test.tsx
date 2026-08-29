// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const qaState = {
  active: 'git',
  currentPage: 1,
  filter: 'all' as 'all' | 'bookmarked',
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

vi.mock('@/components/q&a/useQuestionProgress', () => ({
  useQuestionProgress: () => ({
    viewedItems: new Set(),
    bookmarkedItems: new Set(),
    viewedCount: 0,
    bookmarkedCount: 0,
    totalQuestions: 0,
    isAuthenticated: true,
    isLoading: false,
    markAsViewed: vi.fn(),
    toggleBookmark: vi.fn(),
    resetProgress: vi.fn(),
  }),
}));

vi.mock('@/components/q&a/QuestionProgressToolbar', () => ({
  QuestionProgressToolbar: () => <div data-testid="progress-toolbar" />,
}));

vi.mock('@/components/q&a/AccordionList', () => ({
  __esModule: true,
  default: ({ items }: { items: unknown[]; totalItems: number }) => (
    <div data-testid="accordion-list">{items.length}</div>
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
  CategoryTabButton: ({ label }: { label: string }) => <button>{label}</button>,
}));

import QaSection from '@/components/q&a/QaSection';
import { categoryData } from '@/data/category';

describe('QaSection', () => {
  beforeEach(() => {
    qaState.filter = 'all';
    qaState.items = [];
    qaState.totalItems = 0;
    qaState.totalPages = 0;
    qaState.handleFilterChange.mockClear();
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

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(categoryData.length);
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
});
