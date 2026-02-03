// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BlogNavLinks } from '@/components/blog/BlogNavLinks';

const fetchMock = vi.fn();

vi.mock('@/client', () => ({
  client: {
    fetch: () => fetchMock(),
  },
}));

vi.mock('@/i18n/routing', () => ({
  usePathname: () => '/blog',
  Link: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams({ category: 'Tech' }),
}));

vi.mock('@/lib/utils', () => ({
  cn: (...args: unknown[]) => args.flat().filter(Boolean).join(' '),
}));

afterEach(() => {
  fetchMock.mockReset();
});

describe('BlogNavLinks', () => {
  it('renders category links and marks active', async () => {
    fetchMock.mockResolvedValueOnce([
      { _id: '1', title: 'Tech' },
      { _id: '2', title: 'News' },
    ]);

    render(<BlogNavLinks />);

    await waitFor(() => {
      expect(screen.getByText('Tech')).toBeInTheDocument();
    });

    const techLink = screen.getByText('Tech').closest('a');
    expect(techLink).toHaveAttribute('aria-current', 'page');
    expect(techLink).toHaveAttribute('href', '/blog?category=Tech');
  });
});
