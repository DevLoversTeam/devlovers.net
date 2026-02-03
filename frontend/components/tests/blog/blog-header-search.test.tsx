// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach,beforeEach, describe, expect, it, vi } from 'vitest';

import { BlogHeaderSearch } from '@/components/blog/BlogHeaderSearch';

const pushMock = vi.fn();
const replaceMock = vi.fn();

vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      searchPlaceholder: 'Пошук',
      noMatches: 'Нічого не знайдено',
    };
    return map[key] || key;
  },
  useLocale: () => 'uk',
}));

afterEach(() => {
  pushMock.mockReset();
  replaceMock.mockReset();
  vi.restoreAllMocks();
});

describe('BlogHeaderSearch', () => {
  it('shows results when query matches title or body words', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          _id: '1',
          title: 'Як підготуватися до співбесіди',
          body: [
            {
              _type: 'block',
              children: [{ text: 'Поради для співбесіди' }],
            },
          ],
          slug: { current: 'interview' },
        },
        {
          _id: '2',
          title: 'Docker для початківців',
          body: [
            {
              _type: 'block',
              children: [{ text: 'Контейнери' }],
            },
          ],
          slug: { current: 'docker' },
        },
      ],
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    render(<BlogHeaderSearch />);

    fireEvent.click(screen.getByRole('button', { name: 'Search blog' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const input = screen.getByPlaceholderText('Пошук');
    fireEvent.change(input, { target: { value: 'співбесіди' } });

    expect(
      await screen.findByText('Як підготуватися до співбесіди')
    ).toBeInTheDocument();
    expect(screen.queryByText('Docker для початківців')).toBeNull();
  });

  it('shows empty state when no results', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    render(<BlogHeaderSearch />);

    fireEvent.click(screen.getByRole('button', { name: 'Search blog' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    fireEvent.change(screen.getByPlaceholderText('Пошук'), {
      target: { value: 'немає' },
    });

    expect(await screen.findByText('Нічого не знайдено')).toBeInTheDocument();
  });
});
