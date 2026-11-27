import { PgDialect } from 'drizzle-orm/pg-core';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as appendQuestions } from '@/app/api/admin/quiz/[id]/questions/route';
import { POST as createQuiz } from '@/app/api/admin/quiz/route';
import {
  quizAnswers,
  quizAnswerTranslations,
  quizQuestionContent,
  quizQuestions,
  quizTranslations,
  quizzes,
} from '@/db/schema/quiz';
import { locales } from '@/i18n/config';
import { issueCsrfToken } from '@/lib/security/csrf';
import type { JsonQuestion } from '@/lib/validation/admin-quiz';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  write: vi.fn(),
  delete: vi.fn(),
  deleteWhere: vi.fn(),
  update: vi.fn(),
  updateValues: vi.fn(),
  getCurrentUser: vi.fn(),
  invalidateQuizCache: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/db', () => ({ db: mocks }));
vi.mock('@/db/queries/categories/admin-categories', () => ({
  getMaxQuizDisplayOrder: async () => 4,
}));
vi.mock('@/lib/auth', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/lib/quiz/quiz-answers-redis', () => ({
  invalidateQuizCache: mocks.invalidateQuizCache,
}));
vi.mock('@/lib/logging', () => ({ logError: mocks.logError }));

const origin = 'http://localhost:3000';
const quizId = '1a26c531-5464-4627-a425-1f76be184fc4';
const path = '/api/admin/quiz';
const questionIds = ['q1', 'q2'];
const answerIds = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'];

const questions: JsonQuestion[] = [7, 3].map(order => ({
  order,
  difficulty: 'beginner',
  en: { q: `EN question ${order}`, exp: `EN explanation ${order}` },
  uk: { q: `UK question ${order}`, exp: `UK explanation ${order}` },
  pl: { q: `PL question ${order}`, exp: `PL explanation ${order}` },
  answers: [0, 1, 2, 3].map(index => ({
    correct: index === 1,
    en: `EN ${order}/${index}`,
    uk: `UK ${order}/${index}`,
    pl: `PL ${order}/${index}`,
  })),
}));

function selectRows(rows: object[]) {
  const query = Object.assign(Promise.resolve(rows), {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  });
  mocks.select.mockReturnValueOnce(query);
}

function request(route: string, purpose: string, body: object) {
  return new NextRequest(origin + route, {
    method: 'POST',
    headers: { origin, 'x-csrf-token': issueCsrfToken(purpose) },
    body: JSON.stringify(body),
  });
}

function create() {
  selectRows([]);
  const translation = { title: 'Git', description: 'Git questions' };
  return createQuiz(
    request(path, 'admin:quiz:create', {
      categoryId: 'ba584e52-9688-4d83-86f4-1378725de54e',
      slug: 'git',
      translations: { en: translation, uk: translation, pl: translation },
      questions,
    })
  );
}

function append() {
  selectRows([{ id: quizId, status: 'draft' }]);
  selectRows([{ maxOrder: 12 }]);
  selectRows([{ count: 7 }]);
  return appendQuestions(
    request(`${path}/${quizId}/questions`, 'admin:quiz:questions:add', {
      questions,
    }),
    { params: Promise.resolve({ id: quizId }) }
  );
}

describe('admin quiz question writes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('APP_ORIGIN', origin);
    vi.stubEnv('CSRF_SECRET', 'admin-quiz-test-secret');
    vi.stubEnv('ENABLE_ADMIN_API', 'true');
    mocks.getCurrentUser.mockResolvedValue({ role: 'admin' });
    mocks.insert.mockImplementation(table => ({
      values: (rows: unknown) => {
        mocks.write(table, rows);
        const ids =
          table === quizzes
            ? [quizId]
            : table === quizQuestions
              ? questionIds
              : answerIds;
        return { returning: async () => ids.map(id => ({ id })) };
      },
    }));
    mocks.delete.mockReturnValue({ where: mocks.deleteWhere });
    mocks.update.mockReturnValue({
      set: mocks.updateValues.mockReturnValue({ where: vi.fn() }),
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('uses imported positions when creating a quiz and writes all answer translations', async () => {
    const response = await create();

    expect(await response.json()).toEqual({ success: true, quizId });
    expect(mocks.write.mock.calls.map(([table]) => table)).toEqual([
      quizzes,
      quizTranslations,
      quizQuestions,
      quizQuestionContent,
      quizAnswers,
      quizAnswerTranslations,
    ]);
    expect(mocks.write).toHaveBeenCalledWith(
      quizQuestions,
      [7, 3].map(displayOrder => ({
        quizId,
        displayOrder,
        difficulty: 'beginner',
      }))
    );
    expect(mocks.write).toHaveBeenCalledWith(
      quizQuestionContent,
      questions.flatMap((question, index) =>
        locales.map(locale => ({
          quizQuestionId: questionIds[index],
          locale,
          questionText: question[locale].q,
          explanation: [
            { type: 'paragraph', children: [{ text: question[locale].exp }] },
          ],
        }))
      )
    );
    expect(mocks.write).toHaveBeenCalledWith(
      quizAnswerTranslations,
      questions
        .flatMap(question => question.answers)
        .flatMap((answer, index) =>
          locales.map(locale => ({
            quizAnswerId: answerIds[index],
            locale,
            answerText: answer[locale],
          }))
        )
    );
  });

  it('appends sequentially after the existing questions and invalidates the cache', async () => {
    const response = await append();

    expect(await response.json()).toEqual({
      success: true,
      addedCount: 2,
      totalCount: 7,
    });
    expect(mocks.write).toHaveBeenCalledWith(
      quizQuestions,
      [13, 14].map(displayOrder => ({
        quizId,
        displayOrder,
        difficulty: 'beginner',
      }))
    );
    expect(mocks.updateValues).toHaveBeenCalledWith({ questionsCount: 7 });
    expect(mocks.invalidateQuizCache).toHaveBeenCalledWith(quizId);
  });

  it.each([
    { name: 'create', run: create, table: quizzes, ids: [quizId] },
    { name: 'append', run: append, table: quizQuestions, ids: questionIds },
  ])(
    'cleans up only the batch owned by the $name route after a write failure',
    async ({ run, table, ids }) => {
      mocks.write.mockImplementation(target => {
        if (target === quizAnswerTranslations) throw new Error('write failed');
      });

      const response = await run();

      expect(response.status).toBe(500);
      expect(mocks.delete).toHaveBeenCalledExactlyOnceWith(table);
      const condition = mocks.deleteWhere.mock.calls[0][0];
      expect(new PgDialect().sqlToQuery(condition).params).toEqual(ids);
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.invalidateQuizCache).not.toHaveBeenCalled();
    }
  );
});
