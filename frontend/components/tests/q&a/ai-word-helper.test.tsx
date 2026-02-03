// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getCachedExplanationMock = vi.fn();
const setCachedExplanationMock = vi.fn();

vi.mock('@/lib/ai/explainCache', () => ({
  getCachedExplanation: (term: string) => getCachedExplanationMock(term),
  setCachedExplanation: (term: string, value: unknown) =>
    setCachedExplanationMock(term, value),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'en' }),
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}));

import AIWordHelper from '@/components/q&a/AIWordHelper';

function mockFetchSequence(
  responses: Array<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
  }>
) {
  const fetchMock = vi.fn();
  responses.forEach(response => {
    fetchMock.mockResolvedValueOnce(response);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('AIWordHelper', () => {
  beforeEach(() => {
    getCachedExplanationMock.mockReset();
    setCachedExplanationMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows guest CTA when user is not authenticated', async () => {
    mockFetchSequence([
      {
        ok: true,
        status: 200,
        json: async () => ({ user: null }),
      },
    ]);

    render(<AIWordHelper term="CSS" isOpen onClose={vi.fn()} />);

    expect(await screen.findByText('guest.title')).toBeTruthy();
  });

  it('renders cached explanation without calling AI endpoint', async () => {
    getCachedExplanationMock.mockReturnValue({
      en: 'Cached',
      uk: 'Cached-ua',
      pl: 'Cached-pl',
    });

    const fetchMock = mockFetchSequence([
      {
        ok: true,
        status: 200,
        json: async () => ({ user: { id: 'u1' } }),
      },
    ]);

    render(<AIWordHelper term="Git" isOpen onClose={vi.fn()} />);

    expect(await screen.findByText('Cached')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('renders explanation from API', async () => {
    mockFetchSequence([
      {
        ok: true,
        status: 200,
        json: async () => ({ user: { id: 'u1' } }),
      },
      {
        ok: true,
        status: 200,
        json: async () => ({
          en: 'Hello',
          uk: 'Привіт',
          pl: 'Czesc',
        }),
      },
    ]);

    render(<AIWordHelper term="Git" isOpen onClose={vi.fn()} />);

    expect(await screen.findByText('Hello')).toBeTruthy();
    expect(setCachedExplanationMock).toHaveBeenCalled();
  });

  it('shows rate limit state for 429 responses', async () => {
    mockFetchSequence([
      {
        ok: true,
        status: 200,
        json: async () => ({ user: { id: 'u1' } }),
      },
      {
        ok: false,
        status: 429,
        json: async () => ({ code: 'RATE_LIMITED', resetIn: 60000 }),
      },
    ]);

    render(<AIWordHelper term="Git" isOpen onClose={vi.fn()} />);

    expect(await screen.findByText('Give it a moment')).toBeTruthy();
  });

  it('shows service error state for 503 responses', async () => {
    mockFetchSequence([
      {
        ok: true,
        status: 200,
        json: async () => ({ user: { id: 'u1' } }),
      },
      {
        ok: false,
        status: 503,
        json: async () => ({ code: 'SERVICE_UNAVAILABLE' }),
      },
    ]);

    render(<AIWordHelper term="Git" isOpen onClose={vi.fn()} />);

    expect(await screen.findByText('AI is taking a nap')).toBeTruthy();
  });

  it('retries after rate limit and eventually renders content', async () => {
    mockFetchSequence([
      {
        ok: true,
        status: 200,
        json: async () => ({ user: { id: 'u1' } }),
      },
      {
        ok: false,
        status: 429,
        json: async () => ({ code: 'RATE_LIMITED', resetIn: 60000 }),
      },
      {
        ok: true,
        status: 200,
        json: async () => ({
          en: 'Recovered',
          uk: 'Відновлено',
          pl: 'Odzyskano',
        }),
      },
    ]);

    render(<AIWordHelper term="Git" isOpen onClose={vi.fn()} />);

    expect(await screen.findByText('Give it a moment')).toBeTruthy();

    const retryButton = screen.getByRole('button', { name: "I'll try later" });
    await act(async () => {
      retryButton.click();
    });

    expect(await screen.findByText('Recovered')).toBeTruthy();
  });

  it('renders loading state while fetching', async () => {
    let resolveJson: (value: unknown) => void;

    const fetchMock = mockFetchSequence([
      {
        ok: true,
        status: 200,
        json: async () => ({ user: { id: 'u1' } }),
      },
      {
        ok: true,
        status: 200,
        json: () =>
          new Promise(resolve => {
            resolveJson = resolve;
          }),
      },
    ]);

    render(<AIWordHelper term="Git" isOpen onClose={vi.fn()} />);

    expect(await screen.findByText('loading')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalled();

    resolveJson?.({
      en: 'Delayed',
      uk: 'Затримка',
      pl: 'Opóźnienie',
    });

    expect(await screen.findByText('Delayed')).toBeTruthy();
  });

  it('renders fallback content when payload is partial', async () => {
    mockFetchSequence([
      {
        ok: true,
        status: 200,
        json: async () => ({ user: { id: 'u1' } }),
      },
      {
        ok: true,
        status: 200,
        json: async () => ({ en: 'Missing locales' }),
      },
    ]);

    render(<AIWordHelper term="Git" isOpen onClose={vi.fn()} />);

    expect(await screen.findByText('Missing locales')).toBeTruthy();
  });
});
