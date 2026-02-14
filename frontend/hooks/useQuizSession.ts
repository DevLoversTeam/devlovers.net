import { useEffect } from 'react';

import {
  clearQuizSession,
  loadQuizSession,
  type QuizSessionData,
  saveQuizSession,
} from '@/lib/quiz/quiz-session';
import {
  getQuizReloadKey,
  QUIZ_ALLOW_RESTORE_KEY,
} from '@/lib/quiz/quiz-storage-keys';

type Answer = {
  questionId: string;
  selectedAnswerId: string;
  isCorrect: boolean;
  answeredAt: Date;
};

type QuizState = {
  status: 'rules' | 'in_progress' | 'completed';
  currentIndex: number;
  answers: Answer[];
  questionStatus: 'answering' | 'revealed';
  selectedAnswerId: string | null;
  startedAt: Date | null;
  pointsAwarded: number | null;
  attemptId: string | null;
  isIncomplete: boolean;
};

type UseQuizSessionParams = {
  quizId: string;
  state: QuizState;
  onRestore: (data: QuizSessionData) => void;
};

export function useQuizSession({
  quizId,
  state,
  onRestore,
}: UseQuizSessionParams): void {
  const reloadKey = getQuizReloadKey(quizId);

  useEffect(() => {
    const isReload = sessionStorage.getItem(reloadKey);
    if (isReload) {
      sessionStorage.removeItem(reloadKey);
    }

    const allowRestore = sessionStorage.getItem(QUIZ_ALLOW_RESTORE_KEY);
    if (allowRestore) {
      sessionStorage.removeItem(QUIZ_ALLOW_RESTORE_KEY);
    }

    const saved = loadQuizSession(quizId);
    if (!saved) return;

    if (isReload || allowRestore) {
      onRestore(saved);
    } else {
      clearQuizSession(quizId);
    }
  }, [quizId, reloadKey, onRestore]);

  useEffect(() => {
    if (state.status === 'rules') return;

    const sessionData: QuizSessionData = {
      status: state.status,
      currentIndex: state.currentIndex,
      answers: state.answers.map(a => ({
        questionId: a.questionId,
        selectedAnswerId: a.selectedAnswerId,
        isCorrect: a.isCorrect,
        answeredAt: a.answeredAt.getTime(),
      })),
      questionStatus: state.questionStatus,
      selectedAnswerId: state.selectedAnswerId,
      startedAt: state.startedAt?.getTime() ?? null,
      savedAt: Date.now(),
      pointsAwarded: state.pointsAwarded,
      attemptId: state.attemptId,
      isIncomplete: state.isIncomplete,
    };

    saveQuizSession(quizId, sessionData);
  }, [quizId, state]);
}
