'use client';

import { useEffect } from 'react';
import { getPendingQuizResult, clearPendingQuizResult } from '@/lib/quiz/guest-quiz';

interface Props {
  userId: string;
}

export function PendingResultHandler({ userId }: Props) {
  useEffect(() => {
    const pending = getPendingQuizResult();
    if (!pending) return;

    if (pending) {
      fetch("/api/quiz/guest-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          quizId: pending.quizId,
          answers: pending.answers,
          violations: pending.violations,
          timeSpentSeconds: pending.timeSpentSeconds,
        }),
      })
        .then(async (res) => {
          if (res.ok) {
            clearPendingQuizResult();
          } else {
            console.error("Guest-result API error:", res.status);
          }
        })
        .catch(err => {
          console.error("Guest-result fetch error:", err);
        });
    }
  }, [userId]);

  return null;
}