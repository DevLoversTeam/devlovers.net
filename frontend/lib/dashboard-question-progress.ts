import type { DashboardQuestionProgress } from '@/db/queries/question-progress';

type QuestionProgressLoader = (
  userId: string,
  locale: string
) => Promise<DashboardQuestionProgress[]>;

export async function loadQuestionProgressSafely(
  loadProgress: QuestionProgressLoader,
  userId: string,
  locale: string
): Promise<DashboardQuestionProgress[]> {
  try {
    return await loadProgress(userId, locale);
  } catch (error) {
    console.error('[dashboard] Failed to load question progress', error);
    return [];
  }
}
