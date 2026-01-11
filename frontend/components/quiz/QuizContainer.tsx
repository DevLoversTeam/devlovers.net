'use client';

import { useLocale, useTranslations } from 'next-intl';
import { savePendingQuizResult } from '@/lib/guest-quiz';
import { useReducer, useTransition } from 'react';
import { useAntiCheat } from '@/hooks/useAntiCheat';
import { QuizProgress } from './QuizProgress';
import { QuizQuestion } from './QuizQuestion';
import { QuizResult } from './QuizResult';
import { CountdownTimer } from './CountdownTimer';
import { Button } from '@/components/ui/button';
import { submitQuizAttempt } from '@/actions/quiz';
import type { QuizQuestionWithAnswers } from '@/db/queries/quiz';

interface Answer {
  questionId: string;
  selectedAnswerId: string;
  isCorrect: boolean;
  answeredAt: Date;
}

type QuizState = {
  status: 'rules' | 'in_progress' | 'completed';
  currentIndex: number;
  answers: Answer[];
  questionStatus: 'answering' | 'revealed';
  selectedAnswerId: string | null;
  startedAt: Date | null;
  pointsAwarded: number | null;
};

type QuizAction =
  | { type: 'START_QUIZ' }
  | {
      type: 'ANSWER_SELECTED';
      payload: { answerId: string; isCorrect: boolean; questionId: string };
    }
  | { type: 'NEXT_QUESTION' }
  | { type: 'COMPLETE_QUIZ'; payload?: { pointsAwarded: number } }
  | { type: 'RESTART' };



function quizReducer(state: QuizState, action: QuizAction): QuizState {
  switch (action.type) {
    case 'START_QUIZ':
      return {
        ...state,
        status: 'in_progress',
        startedAt: new Date(),
      };

    case 'ANSWER_SELECTED':
      return {
        ...state,
        selectedAnswerId: action.payload.answerId,
        questionStatus: 'revealed',
        answers: [
          ...state.answers,
          {
            questionId: action.payload.questionId,
            selectedAnswerId: action.payload.answerId,
            isCorrect: action.payload.isCorrect,
            answeredAt: new Date(),
          },
        ],
      };

    case 'NEXT_QUESTION':
      return {
        ...state,
        currentIndex: state.currentIndex + 1,
        questionStatus: 'answering',
        selectedAnswerId: null,
      };

    case 'COMPLETE_QUIZ':
      return {
        ...state,
        status: 'completed',
        pointsAwarded: action.payload?.pointsAwarded ?? null,
      };

    case 'RESTART':
      return {
        status: 'rules',
        currentIndex: 0,
        answers: [],
        questionStatus: 'answering',
        selectedAnswerId: null,
        startedAt: null,
        pointsAwarded: null,
      };

    default:
      return state;
  }
}

interface QuizContainerProps {
  quizId: string;
  questions: QuizQuestionWithAnswers[];
  userId: string | null;
  quizSlug: string;
  timeLimitSeconds: number | null;
  onBackToTopics?: () => void;
}

export function QuizContainer({
  quizSlug,
  quizId,
  questions,
  userId,
  timeLimitSeconds,
  onBackToTopics,
}: QuizContainerProps) {
  const tRules = useTranslations('quiz.rules');
  const [isPending, startTransition] = useTransition();
  const [state, dispatch] = useReducer(quizReducer, {
    status: 'rules',
    currentIndex: 0,
    answers: [],
    questionStatus: 'answering',
    selectedAnswerId: null,
    startedAt: null,
    pointsAwarded: null,
  });
const locale = useLocale();

  const isGuest = userId === null;
  const { violations, violationsCount, resetViolations } = useAntiCheat(
    state.status === 'in_progress'
  );

  const currentQuestion = questions[state.currentIndex];
  const totalQuestions = questions.length;

  const handleStart = () => {
    dispatch({ type: 'START_QUIZ' });
  };

  const handleAnswer = (answerId: string) => {
    const correctAnswer = currentQuestion.answers.find(a => a.isCorrect);
    const isCorrect = answerId === correctAnswer?.id;

    dispatch({
      type: 'ANSWER_SELECTED',
      payload: {
        answerId,
        isCorrect,
        questionId: currentQuestion.id,
      },
    });
  };

  const handleNext = () => {
    if (state.currentIndex + 1 >= totalQuestions) {
      handleSubmit();
    } else {
      dispatch({ type: 'NEXT_QUESTION' });
    }
  };

  const handleSubmit = () => {
      const correctAnswers = state.answers.filter(a => a.isCorrect).length;
  const percentage = (correctAnswers / totalQuestions) * 100;
  const timeSpentSeconds = state.startedAt
    ? Math.floor((Date.now() - state.startedAt.getTime()) / 1000)
    : 0;

  if (isGuest) {
    savePendingQuizResult({
      quizId,
      quizSlug,
      answers: state.answers.map(a => ({
        questionId: a.questionId,
        selectedAnswerId: a.selectedAnswerId,
        isCorrect: a.isCorrect,
      })),
      score: correctAnswers,
      totalQuestions,
      percentage,
      violations: violations.map(v => ({ type: v.type, timestamp: v.timestamp.getTime() })),
      timeSpentSeconds,
      savedAt: Date.now(),
    });
    dispatch({ type: 'COMPLETE_QUIZ' });
    return;
  }
    startTransition(async () => {
      const result = await submitQuizAttempt({
        userId,
        quizId,
        answers: state.answers,
        violations: violations,
        startedAt: state.startedAt!,
        completedAt: new Date(),
        totalQuestions,
      });

      if (result.success) {
        dispatch({ 
          type: 'COMPLETE_QUIZ', 
          payload: { pointsAwarded: result.pointsAwarded ?? 0 } 
        });
      } else {
        console.error('Failed to submit quiz:', result.error);
        dispatch({ type: 'COMPLETE_QUIZ' });
      }
    });
  };

  const handleRestart = () => {
    resetViolations();
    dispatch({ type: 'RESTART' });
  };

  const handleTimeUp = () => {
    handleSubmit();
  };

  const handleBackToTopicsClick = () => {
    if (onBackToTopics) {
      onBackToTopics();
    } else {
       window.location.href = `/${locale}/`;
    }
  };

  if (state.status === 'rules') {
    return (
      <div className="max-w-2xl mx-auto space-y-6 p-6 rounded-xl border border-gray-200 dark:border-gray-800">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {tRules('title')}
        </h2>

        <div className="space-y-4 text-gray-700 dark:text-gray-300">
          <div className="flex gap-3">
            <span className="text-xl">📝</span>
            <div>
              <p className="font-medium">{tRules('general.title')}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {tRules('general.description')}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <span className="text-xl">🚫</span>
            <div>
              <p className="font-medium">{tRules('forbidden.title')}</p>
              <ul className="text-sm text-gray-600 dark:text-gray-400 list-disc list-inside space-y-1">
                <li>{tRules('forbidden.copyPaste')}</li>
                <li>{tRules('forbidden.contextMenu')}</li>
                <li>{tRules('forbidden.tabSwitch')}</li>
                <li>{tRules('forbidden.externalSources')}</li>
              </ul>
            </div>
          </div>

          <div className="flex gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="font-medium">{tRules('control.title')}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {tRules('control.description')}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <span className="text-xl">⏱️</span>
            <div>
              <p className="font-medium">{tRules('time.title')}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {tRules('time.description', { seconds: totalQuestions * 3 })}
              </p>
            </div>
          </div>
        </div>

        <Button onClick={handleStart} className="w-full" size="lg">
          {tRules('startButton')}
        </Button>
      </div>
    );
  }

  if (state.status === 'completed') {
    const correctAnswers = state.answers.filter(a => a.isCorrect).length;
    const percentage = (correctAnswers / totalQuestions) * 100;

    return (
      <QuizResult
        score={correctAnswers}
        total={totalQuestions}
        percentage={percentage}
        answeredCount={state.answers.length}
        violationsCount={violationsCount}
        pointsAwarded={state.pointsAwarded}
        onRestart={handleRestart}
        onBackToTopics={handleBackToTopicsClick}
        isGuest={isGuest}
        quizSlug={quizSlug}
      />
    );
  }

  return (
    <div className="space-y-8 no-select">
      <QuizProgress
        current={state.currentIndex}
        total={totalQuestions}
        answers={state.answers}
      />

      {(() => {
        const calculatedTime = timeLimitSeconds ?? (totalQuestions * 30);
        return (
          <CountdownTimer
            timeLimitSeconds={calculatedTime}
            onTimeUp={handleTimeUp}
            isActive={state.status === 'in_progress'}
          />
        );
      })()}

      <QuizQuestion
        question={currentQuestion}
        status={state.questionStatus}
        selectedAnswerId={state.selectedAnswerId}
        onAnswer={handleAnswer}
        onNext={handleNext}
        isLoading={isPending}
      />
    </div>
  );
}
