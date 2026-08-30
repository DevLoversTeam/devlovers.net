import { describe, expect, it, vi } from 'vitest';

import { loadQuestionProgressSafely } from '@/lib/dashboard-question-progress';

describe('loadQuestionProgressSafely', () => {
  it('returns loaded question progress', async () => {
    const progress = [
      {
        categoryId: 'category-1',
        categorySlug: 'git',
        categoryTitle: 'Git',
        totalQuestions: 100,
        viewedCount: 3,
        bookmarkedCount: 1,
        lastOpenedAt: null,
        lastActivityAt: null,
        lastOpenedQuestionId: null,
      },
    ];
    const loadProgress = vi.fn().mockResolvedValue(progress);

    await expect(
      loadQuestionProgressSafely(loadProgress, 'user-1', 'en')
    ).resolves.toEqual(progress);
    expect(loadProgress).toHaveBeenCalledWith('user-1', 'en');
  });

  it('returns an empty section when progress loading fails', async () => {
    const error = new Error('database unavailable');
    const loadProgress = vi.fn().mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      loadQuestionProgressSafely(loadProgress, 'user-1', 'en')
    ).resolves.toEqual([]);
    expect(consoleError).toHaveBeenCalledWith(
      '[dashboard] Failed to load question progress',
      error
    );

    consoleError.mockRestore();
  });
});
