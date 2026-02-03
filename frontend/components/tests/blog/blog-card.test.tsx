// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import BlogCard from '@/components/blog/BlogCard';
import type { Author, Post } from '@/components/blog/BlogFilters';

vi.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => <img {...props} />,
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/lib/blog/date', () => ({
  formatBlogDate: () => '01.01.2026',
}));

describe('BlogCard', () => {
  it('renders title, excerpt, category badge and author', () => {
    const author: Author = {
      name: 'Анна',
      image: 'https://example.com/anna.jpg',
    };
    const post: Post = {
      _id: '1',
      title: 'Пост про співбесіду',
      slug: { current: 'interview' },
      publishedAt: '2026-01-01',
      categories: ['Growth'],
      body: [
        {
          _type: 'block',
          children: [{ _type: 'span', text: 'Опис поста' }],
        },
      ],
      author,
      mainImage: 'https://example.com/image.jpg',
    };

    const onAuthorSelect = vi.fn();

    render(<BlogCard post={post} onAuthorSelect={onAuthorSelect} />);

    expect(screen.getByText('Пост про співбесіду')).toBeInTheDocument();
    expect(screen.getByText('Опис поста')).toBeInTheDocument();
    expect(screen.getByText('Career')).toBeInTheDocument();
    expect(screen.getByText('Анна')).toBeInTheDocument();
    expect(screen.getByText('01.01.2026')).toBeInTheDocument();
  });

  it('calls onAuthorSelect when author is clicked', () => {
    const author: Author = { name: 'Анна' };
    const post: Post = {
      _id: '1',
      title: 'Пост',
      slug: { current: 'post' },
      author,
    };

    const onAuthorSelect = vi.fn();

    render(<BlogCard post={post} onAuthorSelect={onAuthorSelect} />);

    fireEvent.click(screen.getByRole('button', { name: 'Анна' }));
    expect(onAuthorSelect).toHaveBeenCalledWith(author);
  });
});
