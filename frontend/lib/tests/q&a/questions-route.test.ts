import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
  },
}));

import { db } from '@/db';
import { GET } from '@/app/api/questions/[category]/route';

type Builder = {
  from: ReturnType<typeof vi.fn>;
  innerJoin: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  offset: ReturnType<typeof vi.fn>;
};

function makeBuilder(finalMethod: keyof Builder, result: unknown): Builder {
  const builder: Builder = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
  };

  builder[finalMethod] = vi.fn().mockResolvedValue(result);
  return builder;
}

describe('GET /api/questions/[category]', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns empty payload for unknown category', async () => {
    const selectMock = db.select as ReturnType<typeof vi.fn>;
    selectMock.mockReturnValueOnce(makeBuilder('limit', []));

    const req = new Request(
      'http://localhost/api/questions/unknown?page=1&limit=10&locale=en'
    );
    const res = await GET(req, {
      params: Promise.resolve({ category: 'unknown' }),
    });

    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.items).toEqual([]);
    expect(data.total).toBe(0);
    expect(data.totalPages).toBe(0);
    expect(data.locale).toBe('en');
  });

  it('returns paginated questions for category', async () => {
    const selectMock = db.select as ReturnType<typeof vi.fn>;
    selectMock
      .mockReturnValueOnce(makeBuilder('limit', [{ id: 'cat-1' }]))
      .mockReturnValueOnce(makeBuilder('where', [{ count: 2 }]))
      .mockReturnValueOnce(
        makeBuilder('offset', [
          {
            id: 'q1',
            categoryId: 'cat-1',
            sortOrder: 1,
            difficulty: null,
            question: 'Question 1',
            answerBlocks: [],
            locale: 'en',
          },
        ])
      );

    const req = new Request(
      'http://localhost/api/questions/git?page=1&limit=10&locale=en'
    );
    const res = await GET(req, {
      params: Promise.resolve({ category: 'git' }),
    });

    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.items).toHaveLength(1);
    expect(data.items[0].question).toBe('Question 1');
    expect(data.total).toBe(2);
    expect(data.totalPages).toBe(1);
    expect(data.page).toBe(1);
  });

  it('returns 500 on db error', async () => {
    const selectMock = db.select as ReturnType<typeof vi.fn>;
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    selectMock.mockImplementation(() => {
      throw new Error('db error');
    });

    const req = new Request('http://localhost/api/questions/git');
    const res = await GET(req, {
      params: Promise.resolve({ category: 'git' }),
    });

    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.items).toEqual([]);
    expect(data.total).toBe(0);
    expect(data.totalPages).toBe(0);
    consoleSpy.mockRestore();
  });
});
