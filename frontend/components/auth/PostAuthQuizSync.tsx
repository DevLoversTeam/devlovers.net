'use client';

import { useEffect } from 'react';

import {
  clearPendingQuizResult,
  getPendingQuizResult,
} from '@/lib/quiz/guest-quiz';

export function PostAuthQuizSync() {
  useEffect(() => {
    queueMicrotask(() => {
      const pendingResult = getPendingQuizResult();
      if (!pendingResult) return;

      (async () => {
        try {
          const res = await fetch('/api/quiz/guest-result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              quizId: pendingResult.quizId,
              answers: pendingResult.answers,
              violations: pendingResult.violations,
              timeSpentSeconds: pendingResult.timeSpentSeconds,
            }),
          });

          if (!res.ok) {
            throw new Error(`Failed to save quiz result (${res.status})`);
          }

          const result = await res.json();

          if (!result?.success) {
            throw new Error('Quiz save did not succeed');
          }
          sessionStorage.setItem(
            'quiz_just_saved',
            JSON.stringify({
              score: result.score,
              total: result.totalQuestions,
              percentage: result.percentage,
              pointsAwarded: result.pointsAwarded,
              quizSlug: pendingResult.quizSlug,
            })
          );
          clearPendingQuizResult();
          window.location.reload();
        } catch (error) {
          console.error('Failed to sync guest quiz result:', error);
        }
      })();
    });
  }, []);
  return null;
}
