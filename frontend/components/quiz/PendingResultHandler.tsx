'use client';

import { useEffect } from 'react';
import { getPendingQuizResult, clearPendingQuizResult } from '@/lib/guest-quiz';
import { submitGuestQuizResult } from "@/actions/guest-quiz";

interface Props {
  userId: string;
}

export function PendingResultHandler({ userId }: Props) {
  useEffect(() => {
    const pending = getPendingQuizResult();
    if (pending) {
      submitGuestQuizResult({
        userId,
        quizId: pending.quizId,
        answers: pending.answers,
        violations: pending.violations,
        timeSpentSeconds: pending.timeSpentSeconds,
      }).then(() => {
        clearPendingQuizResult();
      });
    }
  }, [userId]);

  return null;
}