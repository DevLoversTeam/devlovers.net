import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock('@/lib/cache/qa', () => ({
  buildQaCacheKey: vi.fn(() => 'qa:test:key'),
  getQaCache: vi.fn(async () => null),
  setQaCache: vi.fn(async () => undefined),
}));

import { GET } from '@/app/api/questions/[category]/route';
import { db } from '@/db';
import { setQaCache } from '@/lib/cache/qa';

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
      .mockReturnValueOnce(
        makeBuilder('orderBy', [
          {
            id: 'q1',
            categoryId: 'cat-1',
            sortOrder: 1,
            difficulty: null,
            question: 'Question 1',
            answerBlocks: [],
            locale: 'en',
          },
          {
            id: 'q2',
            categoryId: 'cat-1',
            sortOrder: 2,
            difficulty: null,
            question: 'Question 2',
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
    expect(data.items).toHaveLength(2);
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

  it('deduplicates repeated question texts in response payload', async () => {
    const selectMock = db.select as ReturnType<typeof vi.fn>;
    const setQaCacheMock = setQaCache as ReturnType<typeof vi.fn>;

    selectMock
      .mockReturnValueOnce(makeBuilder('limit', [{ id: 'cat-1' }]))
      .mockReturnValueOnce(
        makeBuilder('orderBy', [
          {
            id: 'q1',
            categoryId: 'cat-1',
            sortOrder: 1,
            difficulty: null,
            question: 'What is JavaScript?',
            answerBlocks: [],
            locale: 'en',
          },
          {
            id: 'q2',
            categoryId: 'cat-1',
            sortOrder: 1,
            difficulty: null,
            question: 'What is JavaScript?',
            answerBlocks: [],
            locale: 'en',
          },
          {
            id: 'q3',
            categoryId: 'cat-1',
            sortOrder: 2,
            difficulty: null,
            question: 'What is closure?',
            answerBlocks: [],
            locale: 'en',
          },
        ])
      );

    const req = new Request(
      'http://localhost/api/questions/javascript?page=1&limit=10&locale=en'
    );
    const res = await GET(req, {
      params: Promise.resolve({ category: 'javascript' }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.items).toHaveLength(2);
    expect(
      data.items.map((item: { question: string }) => item.question)
    ).toEqual(['What is JavaScript?', 'What is closure?']);
    expect(data.total).toBe(2);
    expect(data.totalPages).toBe(1);
    expect(setQaCacheMock).toHaveBeenCalledOnce();
  });
});
