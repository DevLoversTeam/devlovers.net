import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/quiz/verify-answer/route';

// Mock the Redis module
vi.mock('@/lib/quiz/quiz-answers-redis', () => ({
  getCorrectAnswer: vi.fn(),
}));

import { getCorrectAnswer } from '@/lib/quiz/quiz-answers-redis';

const mockGetCorrectAnswer = vi.mocked(getCorrectAnswer);

function createVerifyRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/quiz/verify-answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/quiz/verify-answer (Redis)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('successful verification', () => {
    it('returns isCorrect: true for correct answer', async () => {
      const quizId = 'quiz-123';
      const questionId = 'question-1';
      const correctAnswerId = 'answer-a';

      mockGetCorrectAnswer.mockResolvedValue(correctAnswerId);

      const request = createVerifyRequest({
        quizId,
        questionId,
        selectedAnswerId: correctAnswerId,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.isCorrect).toBe(true);
      expect(mockGetCorrectAnswer).toHaveBeenCalledWith(quizId, questionId);
    });

    it('returns isCorrect: false for wrong answer', async () => {
      const quizId = 'quiz-123';
      const questionId = 'question-1';
      const correctAnswerId = 'answer-a';
      const wrongAnswerId = 'answer-b';

      mockGetCorrectAnswer.mockResolvedValue(correctAnswerId);

      const request = createVerifyRequest({
        quizId,
        questionId,
        selectedAnswerId: wrongAnswerId,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.isCorrect).toBe(false);
    });
  });

  describe('validation errors (400)', () => {
    it('returns 400 for missing quizId', async () => {
      const request = createVerifyRequest({
        questionId: 'q-1',
        selectedAnswerId: 'a-1',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Missing required fields');
    });

    it('returns 400 for missing questionId', async () => {
      const request = createVerifyRequest({
        quizId: 'quiz-123',
        selectedAnswerId: 'a-1',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing required fields');
    });

    it('returns 400 for missing selectedAnswerId', async () => {
      const request = createVerifyRequest({
        quizId: 'quiz-123',
        questionId: 'q-1',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('returns 400 for invalid JSON body', async () => {
      const request = new NextRequest(
        'http://localhost/api/quiz/verify-answer',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'not-valid-json',
        }
      );

      const response = await POST(request);

      expect(response.status).toBe(400);
    });
  });

  describe('not found (404)', () => {
    it('returns 404 when question not in cache', async () => {
      mockGetCorrectAnswer.mockResolvedValue(null);

      const request = createVerifyRequest({
        quizId: 'quiz-123',
        questionId: 'unknown-question',
        selectedAnswerId: 'a-1',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Question not found in cache');
    });
  });

  describe('Redis integration', () => {
    it('calls getCorrectAnswer with correct params', async () => {
      mockGetCorrectAnswer.mockResolvedValue('correct-id');

      const request = createVerifyRequest({
        quizId: 'my-quiz',
        questionId: 'my-question',
        selectedAnswerId: 'my-answer',
      });

      await POST(request);

      expect(mockGetCorrectAnswer).toHaveBeenCalledTimes(1);
      expect(mockGetCorrectAnswer).toHaveBeenCalledWith(
        'my-quiz',
        'my-question'
      );
    });
  });
});
