// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { page?: number }) =>
    values?.page ? `${key}-${values.page}` : key,
}));

import { Pagination } from '@/components/q&a/Pagination';

describe('Pagination', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  it('calls onPageChange when clicking next page', () => {
    const onPageChange = vi.fn();

    render(
      <Pagination
        currentPage={1}
        totalPages={3}
        onPageChange={onPageChange}
        accentColor="#ff0000"
      />
    );

    fireEvent.click(screen.getByLabelText('nextPage'));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('disables previous button on first page', () => {
    const onPageChange = vi.fn();

    render(
      <Pagination
        currentPage={1}
        totalPages={2}
        onPageChange={onPageChange}
        accentColor="#ff0000"
      />
    );

    const prevButton = screen.getByLabelText('previousPage');
    expect(prevButton instanceof HTMLButtonElement).toBe(true);
    expect((prevButton as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders ellipsis for large page counts', () => {
    const onPageChange = vi.fn();

    render(
      <Pagination
        currentPage={5}
        totalPages={10}
        onPageChange={onPageChange}
        accentColor="#ff0000"
      />
    );

    const ellipsis = screen.getAllByText('...');
    expect(ellipsis.length).toBeGreaterThan(0);
  });

  it('uses mobile layout for small screens', () => {
    const onPageChange = vi.fn();

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });

    render(
      <Pagination
        currentPage={2}
        totalPages={6}
        onPageChange={onPageChange}
        accentColor="#ff0000"
      />
    );

    const ellipsis = screen.getAllByText('...');
    expect(ellipsis.length).toBeGreaterThan(0);
  });

  it('disables next button on last page', () => {
    const onPageChange = vi.fn();

    render(
      <Pagination
        currentPage={5}
        totalPages={5}
        onPageChange={onPageChange}
        accentColor="#ff0000"
      />
    );

    const nextButton = screen.getByLabelText('nextPage');
    expect(nextButton instanceof HTMLButtonElement).toBe(true);
    expect((nextButton as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders all pages when total is small', () => {
    const onPageChange = vi.fn();

    render(
      <Pagination
        currentPage={1}
        totalPages={4}
        onPageChange={onPageChange}
        accentColor="#ff0000"
      />
    );

    expect(screen.getAllByLabelText(/page-/).length).toBe(4);
  });
});
