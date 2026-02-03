// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Author, Post } from '@/components/blog/BlogFilters';
import BlogFilters from '@/components/blog/BlogFilters';

let searchParams = new URLSearchParams();
const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
  usePathname: () => '/blog',
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      'categories.tech': 'Технології',
      'categories.career': "Кар'єра",
      'categories.insights': 'Інсайти',
      'categories.news': 'Новини',
      author: 'Автор',
      blog: 'Блог',
      noPosts: 'Статей не знайдено',
      all: 'Усі',
      articlesBy: 'Статті',
      articlesPublished: 'Опубліковано',
    };
    return map[key] || key;
  },
  useLocale: () => 'uk',
}));

vi.mock('@/components/blog/BlogGrid', () => ({
  default: ({ posts }: { posts: Post[] }) => (
    <ul data-testid="blog-grid">
      {posts.map(post => (
        <li key={post._id}>{post.title}</li>
      ))}
    </ul>
  ),
}));

afterEach(() => {
  replaceMock.mockReset();
  searchParams = new URLSearchParams();
  vi.restoreAllMocks();
});

describe('BlogFilters', () => {
  it('filters posts by search query in title or body', () => {
    searchParams = new URLSearchParams({ search: 'співбесіди' });
    const posts: Post[] = [
      {
        _id: '1',
        title: 'Як підготуватися до співбесіди',
        slug: { current: 'interview' },
        body: [
          {
            _type: 'block',
            children: [{ _type: 'span', text: 'Поради для співбесіди' }],
          },
        ],
      },
      {
        _id: '2',
        title: 'CSS підказки',
        slug: { current: 'css-tips' },
        body: [
          {
            _type: 'block',
            children: [{ _type: 'span', text: 'Про Flexbox' }],
          },
        ],
      },
    ];

    render(<BlogFilters posts={posts} categories={[]} />);

    const grid = screen.getByTestId('blog-grid');
    expect(grid).toHaveTextContent('Як підготуватися до співбесіди');
    expect(grid).not.toHaveTextContent('CSS підказки');
  });

  it('filters posts by author and renders author heading', async () => {
    searchParams = new URLSearchParams({ author: 'Анна' });
    const posts: Post[] = [
      {
        _id: '1',
        title: 'Пост Анни',
        slug: { current: 'anna-post' },
        author: { name: 'Анна' },
      },
      {
        _id: '2',
        title: 'Пост Віктора',
        slug: { current: 'viktor-post' },
        author: { name: 'Віктор' },
      },
    ];

    const authorPayload: Author = {
      name: 'Анна',
      jobTitle: 'QA',
      company: 'DevLovers',
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => authorPayload,
    });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    render(<BlogFilters posts={posts} categories={[]} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    expect(screen.getByRole('heading', { name: 'Анна' })).toBeInTheDocument();

    const grid = screen.getByTestId('blog-grid');
    expect(grid).toHaveTextContent('Пост Анни');
    expect(grid).not.toHaveTextContent('Пост Віктора');
  });
});
