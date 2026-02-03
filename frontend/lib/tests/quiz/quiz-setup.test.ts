import { afterEach,beforeEach, describe, expect, it } from 'vitest';

import {
  createCorrectAnswersMap,
  createMockQuestion,
  createMockQuestions,
  createMockQuizSession,
  resetFactoryCounters,
} from '../factories/quiz/quiz';
import {
  cleanupQuizTestEnv,
  installMockLocalStorage,
  setupQuizTestEnv,
  TEST_ENCRYPTION_KEY,
} from './setup';

describe('Quiz Test Infrastructure', () => {
  describe('factories', () => {
    beforeEach(() => {
      resetFactoryCounters();
    });

    it('createMockQuestion generates valid question', () => {
      const question = createMockQuestion();

      expect(question.id).toBe('q-1');
      expect(question.answers).toHaveLength(4);
      expect(question.answers.filter(a => a.isCorrect)).toHaveLength(1);
    });

    it('createMockQuestions generates multiple questions', () => {
      const questions = createMockQuestions(5);

      expect(questions).toHaveLength(5);
      expect(questions[0].id).toBe('q-1');
      expect(questions[4].id).toBe('q-5');
    });

    it('createCorrectAnswersMap extracts correct answers', () => {
      const questions = createMockQuestions(3);
      const map = createCorrectAnswersMap(questions);

      expect(Object.keys(map)).toHaveLength(3);
      expect(map['q-1']).toBe('q-1-a1');
      expect(map['q-2']).toBe('q-2-a1');
    });

    it('createMockQuizSession creates valid session', () => {
      const session = createMockQuizSession();

      expect(session.status).toBe('in_progress');
      expect(session.currentIndex).toBe(0);
      expect(session.answers).toEqual([]);
    });

    it('createMockQuizSession accepts overrides', () => {
      const session = createMockQuizSession({
        status: 'completed',
        currentIndex: 5,
      });

      expect(session.status).toBe('completed');
      expect(session.currentIndex).toBe(5);
    });
  });

  describe('environment setup', () => {
    afterEach(() => {
      cleanupQuizTestEnv();
    });

    it('setupQuizTestEnv sets encryption key', () => {
      expect(process.env.QUIZ_ENCRYPTION_KEY).toBeUndefined();

      setupQuizTestEnv();

      expect(process.env.QUIZ_ENCRYPTION_KEY).toBe(TEST_ENCRYPTION_KEY);
    });

    it('cleanupQuizTestEnv removes encryption key', () => {
      setupQuizTestEnv();
      cleanupQuizTestEnv();

      expect(process.env.QUIZ_ENCRYPTION_KEY).toBeUndefined();
    });
  });

  describe('localStorage mock', () => {
    it('installMockLocalStorage provides working storage', () => {
      const { store } = installMockLocalStorage();

      localStorage.setItem('test-key', 'test-value');

      expect(localStorage.getItem('test-key')).toBe('test-value');
      expect(store['test-key']).toBe('test-value');
    });

    it('localStorage.removeItem works', () => {
      installMockLocalStorage();

      localStorage.setItem('key', 'value');
      localStorage.removeItem('key');

      expect(localStorage.getItem('key')).toBeNull();
    });
  });
});
