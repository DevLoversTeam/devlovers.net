/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CookieBanner } from '@/components/shared/CookieBanner';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="#">{children}</a>
  ),
}));

vi.mock('lucide-react', () => ({
  X: () => <span data-testid="close-icon">X</span>,
}));

describe('CookieBanner UI', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Wait 500ms -> Banner Appears', () => {
    render(<CookieBanner />);
    expect(screen.queryByText('title')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByText('title')).toBeDefined();
  });

  it('Click Accept -> Saves to LocalStorage -> Hides Banner', () => {
    render(<CookieBanner />);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    const acceptButton = screen.getByText('accept');
    fireEvent.click(acceptButton);

    expect(localStorage.getItem('cookie-consent')).toBe('accepted');
    expect(screen.queryByText('title')).toBeNull();
  });
});
