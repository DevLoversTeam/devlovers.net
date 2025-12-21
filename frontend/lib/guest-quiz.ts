export interface PendingQuizResult {
  quizId: string;
  quizSlug: string;
  answers: {
    questionId: string;
    selectedAnswerId: string;
    isCorrect: boolean;
  }[];
  score: number;
  totalQuestions: number;
  percentage: number;
  violations: { type: string; timestamp: number }[];
  timeSpentSeconds: number;
  savedAt: number;
}

const STORAGE_KEY = 'devlovers_pending_quiz';
const EXPIRY_HOURS = 24;

export function savePendingQuizResult(result: PendingQuizResult): void {
  if (typeof window === 'undefined') {
    console.log('[DEBUG] savePendingQuizResult: window is undefined (SSR)');
    return;
  }
  console.log('[DEBUG] savePendingQuizResult: saving to localStorage', result);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
  console.log('[DEBUG] savePendingQuizResult: saved successfully');
}

export function getPendingQuizResult(): PendingQuizResult | null {
  if (typeof window === 'undefined') {
    console.log('[DEBUG] getPendingQuizResult: window is undefined (SSR)');
    return null;
  }
  
  const stored = localStorage.getItem(STORAGE_KEY);
  console.log('[DEBUG] getPendingQuizResult: localStorage value =', stored);
  if (!stored) return null;
  
  try {
    const result: PendingQuizResult = JSON.parse(stored);
    const expiryTime = result.savedAt + EXPIRY_HOURS * 60 * 60 * 1000;
    
    if (Date.now() > expiryTime) {
      clearPendingQuizResult();
      return null;
    }
    
    return result;
  } catch {
    clearPendingQuizResult();
    return null;
  }
}

export function clearPendingQuizResult(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}