// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Author, Post } from '@/components/blog/BlogFilters';
import { BlogCategoryGrid } from '@/components/blog/BlogCategoryGrid';

const pushMock = vi.fn();

vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock('@/components/blog/BlogGrid', () => ({
  __esModule: true,
  default: ({ onAuthorSelect }: { onAuthorSelect: (author: Author) => void }) => (
    <button
      type="button"
      onClick={() => onAuthorSelect({ name: 'Анна' })}
    >
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
    expect(pushMock).toHaveBeenCalledWith('/blog?author=%D0%90%D0%BD%D0%BD%D0%B0');
  });
});
