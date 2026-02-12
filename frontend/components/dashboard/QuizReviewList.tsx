'use client';

import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

import type { AttemptQuestionDetail } from '@/types/quiz';

import { QuizReviewCard } from './QuizReviewCard';

interface QuizReviewListProps {
  questions: AttemptQuestionDetail[];
  accentColor?: string;
}

export function QuizReviewList({ questions, accentColor }: QuizReviewListProps) {
  const t = useTranslations('dashboard.quizReview');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const allExpanded = expandedIds.size === questions.length;

  const handleToggleAll = useCallback(() => {
    if (allExpanded) {
      setExpandedIds(new Set());
    } else {
      setExpandedIds(new Set(questions.map((q) => q.questionId)));
    }
  }, [allExpanded, questions]);

  const handleToggle = useCallback((questionId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  }, []);

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={handleToggleAll}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          {allExpanded ? (
            <>
              <ChevronsDownUp className="h-4 w-4" />
              {t('collapseAll')}
            </>
          ) : (
            <>
              <ChevronsUpDown className="h-4 w-4" />
              {t('expandAll')}
            </>
          )}
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {questions.map((question, index) => (
          <QuizReviewCard
            key={question.questionId}
            question={question}
            index={index + 1}
            accentColor={accentColor}
            isOpen={expandedIds.has(question.questionId)}
            onToggle={() => handleToggle(question.questionId)}
          />
        ))}
      </div>
    </div>
  );
}
