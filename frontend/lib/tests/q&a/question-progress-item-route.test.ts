import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/db/queries/question-progress', () => ({
  markQuestionViewed: vi.fn(),
  questionExists: vi.fn(),
  setQuestionBookmark: vi.fn(),
}));

import { PUT } from '@/app/api/question-progress/[questionId]/route';
import {
  markQuestionViewed,
  questionExists,
  setQuestionBookmark,
} from '@/db/queries/question-progress';
import { getCurrentUser } from '@/lib/auth';

const questionId = 'e7bd5d18-c36c-4a24-9ee6-bf2b02884963';
const user = {
  id: 'user-1',
  email: 'user@example.com',
  role: 'user' as const,
  username: 'User',
};
const storedProgress = {
  questionId,
  viewedAt: new Date('2026-08-29T12:00:00.000Z'),
  bookmarkedAt: null,
  lastOpenedAt: new Date('2026-08-29T12:00:00.000Z'),
  updatedAt: new Date('2026-08-29T12:00:00.000Z'),
};

function put(body: unknown, id = questionId) {
  return PUT(
    new Request(`http://localhost/api/question-progress/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ questionId: id }) }
  );
}

describe('PUT /api/question-progress/[questionId]', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('requires authentication', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await put({ viewed: true });

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(questionExists).not.toHaveBeenCalled();
  });

  it('rejects invalid params and mutation payloads', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const invalidIdResponse = await put({ viewed: true }, 'not-a-uuid');
    const ambiguousBodyResponse = await put({
      viewed: true,
      bookmarked: true,
    });

    expect(invalidIdResponse.status).toBe(400);
    expect(ambiguousBodyResponse.status).toBe(400);
    expect(questionExists).not.toHaveBeenCalled();
  });

  it('returns 404 when the question does not exist', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(questionExists).mockResolvedValue(false);

    const response = await put({ viewed: true });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ code: 'QUESTION_NOT_FOUND' });
  });

  it('marks a question as viewed', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(questionExists).mockResolvedValue(true);
    vi.mocked(markQuestionViewed).mockResolvedValue(storedProgress);

    const response = await put({ viewed: true });

    expect(response.status).toBe(200);
    expect(markQuestionViewed).toHaveBeenCalledWith('user-1', questionId);
    expect(setQuestionBookmark).not.toHaveBeenCalled();
    expect((await response.json()).success).toBe(true);
  });

  it('sets the desired bookmark state idempotently', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(questionExists).mockResolvedValue(true);
    vi.mocked(setQuestionBookmark).mockResolvedValue({
      ...storedProgress,
      bookmarkedAt: new Date('2026-08-29T12:01:00.000Z'),
    });

    const response = await put({ bookmarked: true });

    expect(response.status).toBe(200);
    expect(setQuestionBookmark).toHaveBeenCalledWith(
      'user-1',
      questionId,
      true
    );
    expect(markQuestionViewed).not.toHaveBeenCalled();
  });
});
