import { useEffect } from 'react';
import {
  saveQuizSession,
  loadQuizSession,
  clearQuizSession,
  type QuizSessionData,
} from '@/lib/quiz/quiz-session';
import { QUIZ_ALLOW_RESTORE_KEY, getQuizReloadKey } from '@/lib/quiz/quiz-storage-keys';

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
};

type UseQuizSessionParams = {
  quizId: string;
  state: QuizState;
  onRestore: (data: QuizSessionData) => void;
};

export function useQuizSession({ quizId, state, onRestore }: UseQuizSessionParams): void {
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
    if (state.status !== 'in_progress') return;

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
    };

    saveQuizSession(quizId, sessionData);
  }, [quizId, state]);
}
