export const QUIZ_ALLOW_RESTORE_KEY = 'quiz-allow-restore';

export function getQuizReloadKey(quizId: string): string {
  return `quiz-reload:${quizId}`;
}
