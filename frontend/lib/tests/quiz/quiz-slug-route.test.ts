import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/db/queries/quiz', () => ({
  getQuizBySlug: vi.fn(),
  getQuizQuestionsRandomized: vi.fn(),
}));

import { GET } from '@/app/api/quiz/[slug]/route';
import { getQuizBySlug, getQuizQuestionsRandomized } from '@/db/queries/quiz';

const getQuizBySlugMock = getQuizBySlug as ReturnType<typeof vi.fn>;
const getQuizQuestionsRandomizedMock = getQuizQuestionsRandomized as ReturnType<typeof vi.fn>;

describe('GET /api/quiz/[slug]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when quiz not found', async () => {
    getQuizBySlugMock.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/quiz/react?locale=en');
    const response = await GET(request, { params: Promise.resolve({ slug: 'react' }) });

    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Quiz not found');
  });

  it('returns quiz with formatted questions', async () => {
    getQuizBySlugMock.mockResolvedValue({
      id: 'quiz-1',
      slug: 'react',
      title: 'React Quiz',
      description: 'Basics',
      questionsCount: 1,
      timeLimitSeconds: 60,
    });

    getQuizQuestionsRandomizedMock.mockResolvedValue([
      {
        id: 'q1',
        displayOrder: 1,
        difficulty: null,
        questionText: 'Question 1',
        explanation: null,
        answers: [
          { id: 'a1', displayOrder: 1, isCorrect: true, answerText: 'Answer 1' },
        ],
      },
    ]);

    const request = new NextRequest('http://localhost/api/quiz/react?locale=en');
    const response = await GET(request, { params: Promise.resolve({ slug: 'react' }) });

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.quiz).toEqual({
      id: 'quiz-1',
      slug: 'react',
      title: 'React Quiz',
      description: 'Basics',
      questionsCount: 1,
      timeLimitSeconds: 60,
    });
    expect(data.questions[0]).toMatchObject({
      id: 'q1',
      number: 1,
      text: 'Question 1',
      difficulty: null,
      explanation: null,
    });
    expect(data.questions[0].answers[0]).toEqual({
      id: 'a1',
      text: 'Answer 1',
      isCorrect: true,
    });
  });

  it('returns 500 on unexpected error', async () => {
    getQuizBySlugMock.mockRejectedValue(new Error('db error'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const request = new NextRequest('http://localhost/api/quiz/react?locale=en');
    const response = await GET(request, { params: Promise.resolve({ slug: 'react' }) });

    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Internal server error');
    consoleSpy.mockRestore();
  });
});
