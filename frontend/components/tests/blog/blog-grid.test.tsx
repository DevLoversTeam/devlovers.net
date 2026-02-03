// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Post } from '@/components/blog/BlogFilters';
import BlogGrid from '@/components/blog/BlogGrid';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    key === 'noPosts' ? 'Статей не знайдено' : key,
}));

vi.mock('@/components/blog/BlogCard', () => ({
  default: ({ post }: { post: Post }) => <div>{post.title}</div>,
}));

describe('BlogGrid', () => {
  it('renders empty state when no posts', () => {
    render(<BlogGrid posts={[]} onAuthorSelect={() => {}} />);
    expect(screen.getByText('Статей не знайдено')).toBeInTheDocument();
  });

  it('renders posts list', () => {
    const posts: Post[] = [
      { _id: '1', title: 'Post 1', slug: { current: 'p1' } },
      { _id: '2', title: 'Post 2', slug: { current: 'p2' } },
    ];

    render(<BlogGrid posts={posts} onAuthorSelect={() => {}} />);

    expect(screen.getByText('Post 1')).toBeInTheDocument();
    expect(screen.getByText('Post 2')).toBeInTheDocument();
  });
});
