import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/quiz/guest-result/route';

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/db/queries/points', () => ({
  calculateQuizPoints: vi.fn(),
  awardQuizPoints: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

import { db } from '@/db';
import { awardQuizPoints, calculateQuizPoints } from '@/db/queries/points';
import { getCurrentUser } from '@/lib/auth';

const getCurrentUserMock = getCurrentUser as ReturnType<typeof vi.fn>;
const calculateQuizPointsMock = calculateQuizPoints as ReturnType<typeof vi.fn>;
const awardQuizPointsMock = awardQuizPoints as ReturnType<typeof vi.fn>;
const selectMock = db.select as ReturnType<typeof vi.fn>;
const insertMock = db.insert as ReturnType<typeof vi.fn>;

const makeSelectChain = (result: unknown) => ({
  from: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(result),
  }),
});

describe('POST /api/quiz/guest-result', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when user is not authenticated', async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const request = new Request('http://localhost/api/quiz/guest-result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quizId: 'quiz-1',
        answers: [{ questionId: 'q1', selectedAnswerId: 'a1' }],
        violations: [],
        timeSpentSeconds: 10,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 404 when quiz has no questions', async () => {
    getCurrentUserMock.mockResolvedValue({ id: 'user-1' });
    selectMock.mockImplementationOnce(() => makeSelectChain([]));

    const request = new Request('http://localhost/api/quiz/guest-result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quizId: 'quiz-1',
        answers: [{ questionId: 'q1', selectedAnswerId: 'a1' }],
        violations: [],
        timeSpentSeconds: 10,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Quiz not found');
  });

  it('returns 400 when answers count mismatches questions', async () => {
    getCurrentUserMock.mockResolvedValue({ id: 'user-1' });
    selectMock.mockImplementationOnce(() =>
      makeSelectChain([{ id: 'q1' }, { id: 'q2' }])
    );

    const request = new Request('http://localhost/api/quiz/guest-result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quizId: 'quiz-1',
        answers: [{ questionId: 'q1', selectedAnswerId: 'a1' }],
        violations: [],
        timeSpentSeconds: 10,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid input: answers count mismatch');
  });

  it('returns 400 when answer selection is invalid', async () => {
    getCurrentUserMock.mockResolvedValue({ id: 'user-1' });
    selectMock
      .mockImplementationOnce(() => makeSelectChain([{ id: 'q1' }]))
      .mockImplementationOnce(() => makeSelectChain([]));

    const request = new Request('http://localhost/api/quiz/guest-result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quizId: 'quiz-1',
        answers: [{ questionId: 'q1', selectedAnswerId: 'a1' }],
        violations: [],
        timeSpentSeconds: 10,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid answer selection');
  });

  it('returns success and persists attempt', async () => {
    getCurrentUserMock.mockResolvedValue({ id: 'user-1' });
    calculateQuizPointsMock.mockReturnValue(10);
    awardQuizPointsMock.mockResolvedValue(7);

    selectMock
      .mockImplementationOnce(() =>
        makeSelectChain([{ id: 'q1' }, { id: 'q2' }])
      )
      .mockImplementationOnce(() =>
        makeSelectChain([
          { id: 'a1', quizQuestionId: 'q1', isCorrect: true },
          { id: 'a2', quizQuestionId: 'q2', isCorrect: false },
        ])
      );

    insertMock
      .mockImplementationOnce(() => ({
        values: vi.fn().mockImplementation(() => ({
          returning: vi.fn().mockResolvedValue([{ id: 'attempt-1' }]),
        })),
      }))
      .mockImplementationOnce(() => ({
        values: vi.fn().mockResolvedValue(undefined),
      }));

    const request = new Request('http://localhost/api/quiz/guest-result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quizId: 'quiz-1',
        answers: [
          { questionId: 'q1', selectedAnswerId: 'a1' },
          { questionId: 'q2', selectedAnswerId: 'a2' },
        ],
        violations: [{ type: 'copy', timestamp: Date.now() }],
        timeSpentSeconds: 30,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.score).toBe(1);
    expect(data.totalQuestions).toBe(2);
    expect(data.pointsAwarded).toBe(7);
  });
});
