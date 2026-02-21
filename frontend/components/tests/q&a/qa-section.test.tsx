// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const qaState = {
  active: 'git',
  currentPage: 1,
  handleCategoryChange: vi.fn(),
  handlePageChange: vi.fn(),
  isLoading: false,
  items: [] as unknown[],
  localeKey: 'en',
  totalPages: 0,
};

vi.mock('@/components/q&a/useQaTabs', () => ({
  useQaTabs: () => qaState,
}));

vi.mock('@/components/q&a/AccordionList', () => ({
  __esModule: true,
  default: ({ items }: { items: unknown[] }) => (
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
  it('renders empty state when no questions', () => {
    qaState.totalPages = 0;
    render(<QaSection />);

    expect(screen.getAllByText('noQuestions').length).toBeGreaterThan(0);
  });

  it('renders category tabs and pagination', () => {
    qaState.totalPages = 3;
    qaState.items = [{ id: 'q1' }];
    render(<QaSection />);

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(categoryData.length);
    expect(screen.getByTestId('pagination')).toBeTruthy();
  });
});
