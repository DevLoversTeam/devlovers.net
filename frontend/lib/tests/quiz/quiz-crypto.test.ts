import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createEncryptedAnswersBlob,
  decryptAnswers,
  encryptAnswers,
} from '@/lib/quiz/quiz-crypto';

import {
  createCorrectAnswersMap,
  createMockQuestions,
  resetFactoryCounters,
} from '../factories/quiz/quiz';
import { cleanupQuizTestEnv, setupQuizTestEnv } from './setup';

describe('quiz-crypto', () => {
  // Setup: set encryption key before each test
  beforeEach(() => {
    setupQuizTestEnv();
    resetFactoryCounters();
  });

  // Cleanup: remove encryption key after each test
  afterEach(() => {
    cleanupQuizTestEnv();
  });

  describe('encryptAnswers', () => {
    it('returns a base64 string', () => {
      const answers = { 'q-1': 'a-1' };

      const result = encryptAnswers(answers);

      // Base64 pattern: letters, numbers, +, /, ends with optional =
      expect(result).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    it('returns different output for same input (random IV)', () => {
      const answers = { 'q-1': 'a-1' };

      const result1 = encryptAnswers(answers);
      const result2 = encryptAnswers(answers);

      // Each encryption uses random IV, so outputs differ
      expect(result1).not.toBe(result2);
    });

    it('handles empty object', () => {
      const result = encryptAnswers({});

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('handles multiple questions', () => {
      const answers = {
        'q-1': 'a-1',
        'q-2': 'a-2',
        'q-3': 'a-3',
      };

      const result = encryptAnswers(answers);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('decryptAnswers', () => {
    it('decrypts back to original data', () => {
      const original = { 'q-1': 'a-1', 'q-2': 'a-2' };

      const encrypted = encryptAnswers(original);
      const decrypted = decryptAnswers(encrypted);

      expect(decrypted).toEqual(original);
    });

    it('returns null for tampered data', () => {
      const original = { 'q-1': 'a-1' };
      const encrypted = encryptAnswers(original);

      // Tamper: change last 5 characters
      const tampered = encrypted.slice(0, -5) + 'XXXXX';

      const result = decryptAnswers(tampered);

      expect(result).toBeNull();
    });

    it('returns null for invalid base64', () => {
      const result = decryptAnswers('not-valid-base64!!!');

      expect(result).toBeNull();
    });

    it('returns null for empty string', () => {
      const result = decryptAnswers('');

      expect(result).toBeNull();
    });

    it('returns null for truncated data', () => {
      const original = { 'q-1': 'a-1' };
      const encrypted = encryptAnswers(original);

      // Truncate: remove half of the data
      const truncated = encrypted.slice(0, encrypted.length / 2);

      const result = decryptAnswers(truncated);

      expect(result).toBeNull();
    });
  });

  describe('createEncryptedAnswersBlob', () => {
    it('creates encrypted blob from questions', () => {
      const questions = createMockQuestions(3);

      const blob = createEncryptedAnswersBlob(questions);

      expect(blob).toBeDefined();
      expect(typeof blob).toBe('string');
      expect(blob.length).toBeGreaterThan(0);
    });

    it('encrypted blob decrypts to correct answers map', () => {
      const questions = createMockQuestions(3);
      const expectedMap = createCorrectAnswersMap(questions);

      const blob = createEncryptedAnswersBlob(questions);
      const decrypted = decryptAnswers(blob);

      expect(decrypted).toEqual(expectedMap);
    });

    it('handles questions with no correct answer', () => {
      const questions = [
        {
          id: 'q-no-correct',
          answers: [
            { id: 'a-1', isCorrect: false },
            { id: 'a-2', isCorrect: false },
          ],
        },
      ];

      const blob = createEncryptedAnswersBlob(questions);
      const decrypted = decryptAnswers(blob);

      // Question with no correct answer is not included in map
      expect(decrypted).toEqual({});
    });

    it('handles empty questions array', () => {
      const blob = createEncryptedAnswersBlob([]);
      const decrypted = decryptAnswers(blob);

      expect(decrypted).toEqual({});
    });
  });
});
