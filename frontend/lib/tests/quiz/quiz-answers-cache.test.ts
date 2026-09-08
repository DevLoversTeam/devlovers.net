import { beforeEach, describe, expect, it, vi } from 'vitest';

const { redis, select, getRedisClient } = vi.hoisted(() => ({
  redis: { get: vi.fn(), set: vi.fn() },
  select: vi.fn(),
  getRedisClient: vi.fn(),
}));

vi.mock('@/db', () => ({ db: { select } }));
vi.mock('@/lib/redis', () => ({ getRedisClient }));

import {
  getCorrectAnswer,
  getOrCreateQuizAnswersCache,
} from '@/lib/quiz/quiz-answers-redis';

// Correct answers now stay on the server, replacing client-side encrypted blobs.
describe('server-side quiz answer cache', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getRedisClient.mockReturnValue(redis);
  });

  it('uses an existing cache without querying the database', async () => {
    redis.get.mockResolvedValue({ quizId: 'quiz-1', answers: { q1: 'a1' } });
    expect(await getOrCreateQuizAnswersCache('quiz-1')).toBe(true);
    expect(await getCorrectAnswer('quiz-1', 'q1')).toBe('a1');
    expect(redis.get).toHaveBeenCalledWith('quiz:answers:quiz-1');
    expect(select).not.toHaveBeenCalled();
  });

  it('does not return an answer for a question absent from the quiz cache', async () => {
    redis.get.mockResolvedValue({ quizId: 'quiz-1', answers: { q1: 'a1' } });
    expect(await getCorrectAnswer('quiz-1', 'unknown')).toBeNull();
    expect(select).not.toHaveBeenCalled();
  });

  it('populates the cache from correct answers in the database', async () => {
    redis.get.mockResolvedValue(null);
    const where = vi
      .fn()
      .mockResolvedValue([{ questionId: 'q1', answerId: 'a1' }]);
    select.mockReturnValue({ from: () => ({ innerJoin: () => ({ where }) }) });
    expect(await getOrCreateQuizAnswersCache('quiz-1')).toBe(true);
    expect(redis.set).toHaveBeenCalledWith('quiz:answers:quiz-1', {
      quizId: 'quiz-1',
      answers: { q1: 'a1' },
      cachedAt: expect.any(Number),
    });
  });

  it('falls back to the database when Redis is unavailable', async () => {
    getRedisClient.mockReturnValue(null);
    const limit = vi.fn().mockResolvedValue([{ answerId: 'a1' }]);
    select.mockReturnValue({
      from: () => ({ innerJoin: () => ({ where: () => ({ limit }) }) }),
    });
    expect(await getCorrectAnswer('quiz-1', 'q1')).toBe('a1');
    expect(limit).toHaveBeenCalledWith(1);
    expect(redis.get).not.toHaveBeenCalled();
  });
});
