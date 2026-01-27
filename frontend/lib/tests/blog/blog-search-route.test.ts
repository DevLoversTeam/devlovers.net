import { describe, it, expect, vi, afterEach } from 'vitest';

const fetchMock = vi.fn();

vi.mock('@/client', () => ({
  client: {
    withConfig: () => ({
      fetch: fetchMock,
    }),
  },
}));

import { GET } from '@/app/api/blog-search/route';

afterEach(() => {
  fetchMock.mockReset();
});

describe('GET /api/blog-search', () => {
  it('returns items for requested locale', async () => {
    fetchMock.mockResolvedValueOnce([
      { _id: '1', title: 'Post', slug: { current: 'post' } },
    ]);

    const response = await GET(
      new Request('http://localhost/api/blog-search?locale=uk')
    );
    const data = await response.json();

    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), { locale: 'uk' });
    expect(data).toHaveLength(1);
    expect(data[0].title).toBe('Post');
  });
});
