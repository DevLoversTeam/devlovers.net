import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearQuizSession,
  loadQuizSession,
  saveQuizSession,
} from '@/lib/quiz/quiz-session';

import {
  createMockQuizSession,
  resetFactoryCounters,
} from '../factories/quiz/quiz';
import { installMockLocalStorage } from './setup';

describe('quiz-session', () => {
  beforeEach(() => {
    installMockLocalStorage();
    resetFactoryCounters();
  });

  describe('saveQuizSession', () => {
    it('saves session to localStorage', () => {
      const session = createMockQuizSession();

      saveQuizSession('quiz-123', session);

      const stored = localStorage.getItem('quiz_session_quiz-123');
      expect(stored).not.toBeNull();
    });

    it('saves session with updated savedAt timestamp', () => {
      const session = createMockQuizSession({ savedAt: 0 });

      saveQuizSession('quiz-123', session);

      const stored = JSON.parse(localStorage.getItem('quiz_session_quiz-123')!);
      expect(stored.savedAt).toBeGreaterThan(0);
    });

    it('overwrites existing session', () => {
      const session1 = createMockQuizSession({ currentIndex: 1 });
      const session2 = createMockQuizSession({ currentIndex: 5 });

      saveQuizSession('quiz-123', session1);
      saveQuizSession('quiz-123', session2);

      const stored = JSON.parse(localStorage.getItem('quiz_session_quiz-123')!);
      expect(stored.currentIndex).toBe(5);
    });
  });

  describe('loadQuizSession', () => {
    it('loads saved session', () => {
      const session = createMockQuizSession({
        currentIndex: 3,
        status: 'in_progress',
      });
      saveQuizSession('quiz-123', session);

      const loaded = loadQuizSession('quiz-123');

      expect(loaded).not.toBeNull();
      expect(loaded!.currentIndex).toBe(3);
      expect(loaded!.status).toBe('in_progress');
    });

    it('returns null for non-existent session', () => {
      const loaded = loadQuizSession('non-existent');

      expect(loaded).toBeNull();
    });

    it('returns null for expired session (>30 min)', () => {
      const thirtyOneMinutesAgo = Date.now() - 31 * 60 * 1000;
      const session = createMockQuizSession({
        savedAt: thirtyOneMinutesAgo,
        status: 'in_progress',
      });

      // Directly set localStorage to bypass saveQuizSession's timestamp update
      localStorage.setItem('quiz_session_quiz-123', JSON.stringify(session));

      const loaded = loadQuizSession('quiz-123');

      expect(loaded).toBeNull();
    });

    it('returns session if within 30 min', () => {
      const twentyMinutesAgo = Date.now() - 20 * 60 * 1000;
      const session = createMockQuizSession({
        savedAt: twentyMinutesAgo,
        status: 'in_progress',
      });

      localStorage.setItem('quiz_session_quiz-123', JSON.stringify(session));

      const loaded = loadQuizSession('quiz-123');

      expect(loaded).not.toBeNull();
    });

    it('returns null for completed session', () => {
      const session = createMockQuizSession({ status: 'completed' });
      localStorage.setItem(
        'quiz_session_quiz-123',
        JSON.stringify({ ...session, savedAt: Date.now() })
      );

      const loaded = loadQuizSession('quiz-123');

      expect(loaded).toBeNull();
    });

    it('returns null for rules session', () => {
      const session = createMockQuizSession({ status: 'rules' });
      localStorage.setItem(
        'quiz_session_quiz-123',
        JSON.stringify({ ...session, savedAt: Date.now() })
      );

      const loaded = loadQuizSession('quiz-123');

      expect(loaded).toBeNull();
    });

    it('clears expired session from storage', () => {
      const thirtyOneMinutesAgo = Date.now() - 31 * 60 * 1000;
      const session = createMockQuizSession({ savedAt: thirtyOneMinutesAgo });
      localStorage.setItem('quiz_session_quiz-123', JSON.stringify(session));

      loadQuizSession('quiz-123');

      expect(localStorage.getItem('quiz_session_quiz-123')).toBeNull();
    });
  });

  describe('clearQuizSession', () => {
    it('removes session from localStorage', () => {
      const session = createMockQuizSession();
      saveQuizSession('quiz-123', session);

      clearQuizSession('quiz-123');

      expect(localStorage.getItem('quiz_session_quiz-123')).toBeNull();
    });

    it('does nothing if session does not exist', () => {
      // Should not throw
      expect(() => clearQuizSession('non-existent')).not.toThrow();
    });
  });
});
