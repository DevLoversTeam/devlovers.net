import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/db/queries/question-progress', () => ({
  getQuestionProgressForCategory: vi.fn(),
  questionCategoryExists: vi.fn(),
  resetQuestionProgressForCategory: vi.fn(),
}));

import { DELETE, GET } from '@/app/api/question-progress/route';
import {
  getQuestionProgressForCategory,
  questionCategoryExists,
  resetQuestionProgressForCategory,
} from '@/db/queries/question-progress';
import { getCurrentUser } from '@/lib/auth';

const progress = {
  totalQuestions: 100,
  viewedCount: 3,
  bookmarkedCount: 1,
  viewedQuestionIds: ['q1', 'q2', 'q3'],
  bookmarkedQuestionIds: ['q2'],
  lastOpenedQuestionId: 'q3',
  items: [],
};

describe('/api/question-progress', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('requires authentication', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await GET(
      new Request('http://localhost/api/question-progress?category=git')
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ code: 'UNAUTHORIZED' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(questionCategoryExists).not.toHaveBeenCalled();
  });

  it('validates the category query', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: 'user',
      username: 'User',
    });

    const response = await GET(
      new Request('http://localhost/api/question-progress')
    );

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('VALIDATION_ERROR');
  });

  it('returns progress for an authenticated user and category', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: 'user',
      username: 'User',
    });
    vi.mocked(questionCategoryExists).mockResolvedValue(true);
    vi.mocked(getQuestionProgressForCategory).mockResolvedValue(progress);

    const response = await GET(
      new Request('http://localhost/api/question-progress?category=Git')
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ progress });
    expect(getQuestionProgressForCategory).toHaveBeenCalledWith(
      'user-1',
      'git'
    );
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns 404 for an unknown category', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: 'user',
      username: 'User',
    });
    vi.mocked(questionCategoryExists).mockResolvedValue(false);

    const response = await GET(
      new Request('http://localhost/api/question-progress?category=unknown')
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ code: 'CATEGORY_NOT_FOUND' });
  });

  it('resets viewed progress while returning the remaining state', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: 'user',
      username: 'User',
    });
    vi.mocked(questionCategoryExists).mockResolvedValue(true);
    vi.mocked(resetQuestionProgressForCategory).mockResolvedValue({
      ...progress,
      viewedCount: 0,
      viewedQuestionIds: [],
      lastOpenedQuestionId: null,
    });

    const response = await DELETE(
      new Request('http://localhost/api/question-progress?category=git', {
        method: 'DELETE',
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.progress.viewedCount).toBe(0);
    expect(body.progress.bookmarkedCount).toBe(1);
    expect(resetQuestionProgressForCategory).toHaveBeenCalledWith(
      'user-1',
      'git'
    );
  });
});
