// @vitest-environment jsdom
import { fireEvent,render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BlogCategoryGrid } from '@/components/blog/BlogCategoryGrid';
import type { Author, Post } from '@/components/blog/BlogFilters';

const pushMock = vi.fn();

vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock('@/components/blog/BlogGrid', () => ({
  __esModule: true,
  default: ({
    onAuthorSelect,
  }: {
    onAuthorSelect: (author: Author) => void;
  }) => (
    <button type="button" onClick={() => onAuthorSelect({ name: 'Анна' })}>
      select-author
    </button>
  ),
}));

describe('BlogCategoryGrid', () => {
  it('pushes author filter when author selected', () => {
    const posts: Post[] = [
      { _id: '1', title: 'Post', slug: { current: 'post' } },
    ];

    render(<BlogCategoryGrid posts={posts} />);

    fireEvent.click(screen.getByText('select-author'));
    expect(pushMock).toHaveBeenCalledWith(
      '/blog?author=%D0%90%D0%BD%D0%BD%D0%B0'
    );
  });
});
