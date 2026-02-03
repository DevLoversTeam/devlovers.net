import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { POST } from '@/app/api/quiz/verify-answer/route';
import { encryptAnswers } from '@/lib/quiz/quiz-crypto';

import {
  createCorrectAnswersMap,
  createMockQuestions,
  resetFactoryCounters,
} from '../factories/quiz/quiz';
import { cleanupQuizTestEnv, setupQuizTestEnv } from './setup';

/**
 * Creates a mock NextRequest for POST /api/quiz/verify-answer
 */
function createVerifyRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/quiz/verify-answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/quiz/verify-answer', () => {
  beforeEach(() => {
    setupQuizTestEnv();
    resetFactoryCounters();
  });

  afterEach(() => {
    cleanupQuizTestEnv();
  });

  describe('successful verification', () => {
    it('returns isCorrect: true for correct answer', async () => {
      const questions = createMockQuestions(3);
      const correctAnswersMap = createCorrectAnswersMap(questions);
      const encryptedAnswers = encryptAnswers(correctAnswersMap);

      const questionId = questions[0].id;
      const correctAnswerId = correctAnswersMap[questionId];

      const request = createVerifyRequest({
        questionId,
        answerId: correctAnswerId,
        encryptedAnswers,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.isCorrect).toBe(true);
    });

    it('returns isCorrect: false for wrong answer', async () => {
      const questions = createMockQuestions(3);
      const correctAnswersMap = createCorrectAnswersMap(questions);
      const encryptedAnswers = encryptAnswers(correctAnswersMap);

      const questionId = questions[0].id;
      const wrongAnswerId = questions[0].answers[1].id; // second answer is wrong

      const request = createVerifyRequest({
        questionId,
        answerId: wrongAnswerId,
        encryptedAnswers,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.isCorrect).toBe(false);
    });
  });

  describe('validation errors (400)', () => {
    it('returns 400 for missing questionId', async () => {
      const questions = createMockQuestions(1);
      const correctAnswersMap = createCorrectAnswersMap(questions);
      const encryptedAnswers = encryptAnswers(correctAnswersMap);

      const request = createVerifyRequest({
        answerId: 'some-answer',
        encryptedAnswers,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing required fields');
    });

    it('returns 400 for missing answerId', async () => {
      const questions = createMockQuestions(1);
      const correctAnswersMap = createCorrectAnswersMap(questions);
      const encryptedAnswers = encryptAnswers(correctAnswersMap);

      const request = createVerifyRequest({
        questionId: questions[0].id,
        encryptedAnswers,
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('returns 400 for missing encryptedAnswers', async () => {
      const request = createVerifyRequest({
        questionId: 'q-1',
        answerId: 'a-1',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('returns 400 for tampered encryptedAnswers', async () => {
      const questions = createMockQuestions(1);
      const correctAnswersMap = createCorrectAnswersMap(questions);
      const encryptedAnswers = encryptAnswers(correctAnswersMap);

      // Tamper with the encrypted data
      const tamperedAnswers = encryptedAnswers.slice(0, -10) + 'XXXXXXXXXX';

      const request = createVerifyRequest({
        questionId: questions[0].id,
        answerId: questions[0].answers[0].id,
        encryptedAnswers: tamperedAnswers,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid encrypted data');
    });

    it('returns 400 for invalid base64 encryptedAnswers', async () => {
      const request = createVerifyRequest({
        questionId: 'q-1',
        answerId: 'a-1',
        encryptedAnswers: 'not-valid-base64!!!',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
    });
  });

  describe('not found (404)', () => {
    it('returns 404 for unknown questionId', async () => {
      const questions = createMockQuestions(1);
      const correctAnswersMap = createCorrectAnswersMap(questions);
      const encryptedAnswers = encryptAnswers(correctAnswersMap);

      const request = createVerifyRequest({
        questionId: 'unknown-question-id',
        answerId: 'some-answer',
        encryptedAnswers,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Question not found');
    });
  });
});
