const STORAGE_KEY_PREFIX = 'quiz_session_';
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface QuizSessionData {
  status: 'rules' | 'in_progress' | 'completed';
  currentIndex: number;
  answers: Array<{
    questionId: string;
    selectedAnswerId: string;
    isCorrect: boolean;
    answeredAt: number;
  }>;
  questionStatus: 'answering' | 'revealed';
  selectedAnswerId: string | null;
  startedAt: number | null;
  savedAt: number;
}

export function saveQuizSession(quizId: string, state: QuizSessionData): void {
  if (typeof window === 'undefined') return;

  try {
    const data = { ...state, savedAt: Date.now() };
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}${quizId}`,
      JSON.stringify(data)
    );
  } catch (e) {
    console.error('Failed to save quiz session:', e);
  }
}

export function loadQuizSession(quizId: string): QuizSessionData | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${quizId}`);
    if (!raw) return null;

    const data: QuizSessionData = JSON.parse(raw);

    // Discard sessions older than 30 minutes
    if (Date.now() - data.savedAt > SESSION_TTL_MS) {
      clearQuizSession(quizId);
      return null;
    }

    // Only restore in_progress sessions
    if (data.status === 'rules') {
      clearQuizSession(quizId);
      return null;
    }

    return data;
  } catch (e) {
    console.error('Failed to load quiz session:', e);
    return null;
  }
}

export function clearQuizSession(quizId: string): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}${quizId}`);
  } catch (e) {
    console.error('Failed to clear quiz session:', e);
  }
}
