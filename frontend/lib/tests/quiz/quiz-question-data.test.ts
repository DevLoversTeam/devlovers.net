import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAdminQuizFull } from '@/db/queries/quizzes/admin-quiz';
import {
  getAttemptReviewDetails,
  getQuizQuestions,
  stripCorrectAnswers,
} from '@/db/queries/quizzes/quiz';
import { quizAnswers } from '@/db/schema/quiz';

const { redis, select, getRedisClient } = vi.hoisted(() => ({
  redis: { get: vi.fn(), set: vi.fn() },
  select: vi.fn(),
  getRedisClient: vi.fn(),
}));

vi.mock('@/db', () => ({ db: { select } }));
vi.mock('@/lib/redis', () => ({ getRedisClient }));

function queueRows(rows: object[]) {
  const query = Object.assign(Promise.resolve(rows), {
    where: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
  });
  select.mockReturnValueOnce({ from: () => query });
  return query;
}

const questions = ['q1', 'q2', 'q3'].map((id, displayOrder) => ({
  id,
  displayOrder,
  difficulty: null,
  questionText: id,
  explanation: null,
}));

const answers = [
  {
    id: 'a1',
    questionId: 'q1',
    displayOrder: 0,
    isCorrect: true,
    answerText: 'Tak',
  },
  {
    id: 'a2',
    questionId: 'q2',
    displayOrder: 0,
    isCorrect: true,
    answerText: 'Nie',
  },
  {
    id: 'a3',
    questionId: 'q1',
    displayOrder: 1,
    isCorrect: false,
    answerText: null,
  },
];

describe('quiz question data', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('uses the same grouped questions for the DB fallback and the Redis cache', async () => {
    getRedisClient.mockReturnValue(null);
    queueRows(questions);
    const answersQuery = queueRows(answers);

    const fromDb = await getQuizQuestions('quiz', 'pl');
    expect(answersQuery.orderBy).toHaveBeenCalledWith(quizAnswers.displayOrder);
    expect(
      fromDb.map(question => question.answers.map(answer => answer.id))
    ).toEqual([['a1', 'a3'], ['a2'], []]);
    expect(fromDb[0].answers[1].answerText).toBeNull();
    expect(stripCorrectAnswers(fromDb)[0].answers[0]).toEqual({
      id: 'a1',
      displayOrder: 0,
      answerText: 'Tak',
    });

    getRedisClient.mockReturnValue(redis);
    redis.get.mockResolvedValue(null);
    queueRows(questions);
    queueRows(answers);

    expect(await getQuizQuestions('quiz', 'pl')).toEqual(fromDb);
    expect(redis.set).toHaveBeenCalledWith('quiz:questions:quiz:pl', {
      quizId: 'quiz',
      locale: 'pl',
      questions: fromDb,
      cachedAt: expect.any(Number),
    });
  });

  it('caches an empty quiz without querying answers', async () => {
    getRedisClient.mockReturnValue(redis);
    redis.get.mockResolvedValue(null);
    queueRows([]);

    expect(await getQuizQuestions('empty-quiz', 'uk')).toEqual([]);
    expect(select).toHaveBeenCalledOnce();
    expect(redis.set).toHaveBeenCalledWith(
      'quiz:questions:empty-quiz:uk',
      expect.objectContaining({ questions: [] })
    );
  });

  it('filters review answers to incorrect question IDs and keeps the selected answer', async () => {
    queueRows([{ id: 'attempt', quizId: 'quiz' }]);
    queueRows([{ quizQuestionId: 'q1', selectedAnswerId: 'a3' }]);
    queueRows([questions[0]]);
    const answersQuery = queueRows([answers[0], answers[2]]);

    const review = await getAttemptReviewDetails('attempt', 'user', 'pl');

    expect(
      new PgDialect().sqlToQuery(answersQuery.where.mock.calls[0][0]).params
    ).toEqual(['q1']);
    expect(review?.incorrectQuestions[0]?.answers).toEqual([
      { id: 'a1', answerText: 'Tak', isCorrect: true, isSelected: false },
      { id: 'a3', answerText: null, isCorrect: false, isSelected: true },
    ]);
  });

  it('keeps all answer translations in the admin response', async () => {
    queueRows([{ id: 'quiz' }]);
    queueRows([]);
    queueRows([questions[0]]);
    queueRows([]);
    queueRows([answers[0], answers[2]]);
    queueRows([
      { quizAnswerId: 'a1', locale: 'pl', answerText: 'Tak' },
      { quizAnswerId: 'a1', locale: 'uk', answerText: 'Так' },
    ]);

    const quiz = await getAdminQuizFull('quiz');

    expect(quiz?.questions[0]?.answers).toEqual([
      {
        id: 'a1',
        displayOrder: 0,
        isCorrect: true,
        translations: { pl: { answerText: 'Tak' }, uk: { answerText: 'Так' } },
      },
      { id: 'a3', displayOrder: 1, isCorrect: false, translations: {} },
    ]);
  });
});
