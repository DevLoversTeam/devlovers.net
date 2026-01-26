import { describe, it, expect, vi, afterEach } from 'vitest';

const fetchMock = vi.fn();

vi.mock('@/client', () => ({
  client: {
    withConfig: () => ({
      fetch: fetchMock,
    }),
  },
}));

import { GET } from '@/app/api/blog-author/route';

afterEach(() => {
  fetchMock.mockReset();
});

describe('GET /api/blog-author', () => {
  it('returns 400 when name is missing', async () => {
    const response = await GET(
      new Request('http://localhost/api/blog-author?locale=uk')
    );

    expect(response.status).toBe(400);
  });

  it('returns author payload when name is provided', async () => {
    fetchMock.mockResolvedValueOnce({ name: 'Анна' });

    const response = await GET(
      new Request('http://localhost/api/blog-author?name=%D0%90%D0%BD%D0%BD%D0%B0&locale=uk')
    );
    const data = await response.json();

    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), {
      name: 'Анна',
      locale: 'uk',
    });
    expect(data).toEqual({ name: 'Анна' });
  });
});
