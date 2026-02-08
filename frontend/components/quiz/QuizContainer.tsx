'use client';
import { Ban, FileText, TriangleAlert, UserRound } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  useCallback,
  useEffect,
  useReducer,
  useState,
  useTransition,
} from 'react';
import { toast } from 'sonner';

import { initializeQuizCache, submitQuizAttempt } from '@/actions/quiz';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { categoryTabStyles } from '@/data/categoryStyles';
import type { QuizQuestionClient } from '@/db/queries/quiz';
import { useAntiCheat } from '@/hooks/useAntiCheat';
import { useQuizGuards } from '@/hooks/useQuizGuards';
import { useQuizSession } from '@/hooks/useQuizSession';
import { Link } from '@/i18n/routing';
import { savePendingQuizResult } from '@/lib/quiz/guest-quiz';
import {
  clearQuizSession,
  type QuizSessionData,
} from '@/lib/quiz/quiz-session';

import { CountdownTimer } from './CountdownTimer';
import { QuizProgress } from './QuizProgress';
import { QuizQuestion } from './QuizQuestion';
import { QuizResult } from './QuizResult';

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
  isIncomplete: boolean;
};

type QuizAction =
  | { type: 'START_QUIZ' }
  | {
      type: 'ANSWER_SELECTED';
      payload: { answerId: string; isCorrect: boolean; questionId: string };
    }
  | { type: 'NEXT_QUESTION' }
  | {
      type: 'COMPLETE_QUIZ';
      payload?: { pointsAwarded?: number; isIncomplete?: boolean };
    }
  | { type: 'RESTART' }
  | { type: 'RESTORE_SESSION'; payload: QuizSessionData };

function quizReducer(state: QuizState, action: QuizAction): QuizState {
  switch (action.type) {
    case 'START_QUIZ':
      return {
        ...state,
        status: 'in_progress',
        startedAt: new Date(),
      };

    case 'ANSWER_SELECTED':
      const answersWithoutThisQuestion = state.answers.filter(
        a => a.questionId !== action.payload.questionId
      );
      return {
        ...state,
        selectedAnswerId: action.payload.answerId,
        questionStatus: 'revealed',
        answers: [
          ...answersWithoutThisQuestion,
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
        isIncomplete: action.payload?.isIncomplete ?? false,
      };
    case 'RESTORE_SESSION':
      return {
        ...state,
        status: action.payload.status,
        currentIndex: action.payload.currentIndex,
        answers: action.payload.answers.map(a => ({
          ...a,
          answeredAt: new Date(a.answeredAt),
        })),
        questionStatus: action.payload.questionStatus,
        selectedAnswerId: action.payload.selectedAnswerId,
        startedAt: action.payload.startedAt
          ? new Date(action.payload.startedAt)
          : null,
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
        isIncomplete: false,
      };

    default:
      return state;
  }
}

interface QuizContainerProps {
  quizId: string;
  questions: QuizQuestionClient[];
  userId: string | null;
  quizSlug: string;
  timeLimitSeconds: number | null;
  seed: number;
  categorySlug?: string | null;
  onBackToTopics?: () => void;
}

export function QuizContainer({
  quizSlug,
  quizId,
  questions,
  userId,
  timeLimitSeconds,
  seed,
  categorySlug,
  onBackToTopics,
}: QuizContainerProps) {
  const tRules = useTranslations('quiz.rules');
  const tResult = useTranslations('quiz.result');
  const tExit = useTranslations('quiz.exitModal');
  const tQuestion = useTranslations('quiz.question');
  const categoryStyle = categorySlug
    ? categoryTabStyles[categorySlug as keyof typeof categoryTabStyles]
    : null;
  const accentColor = categoryStyle?.accent ?? '#3B82F6';
  const [isStarting, setIsStarting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [state, dispatch] = useReducer(quizReducer, {
    status: 'rules',
    currentIndex: 0,
    answers: [],
    questionStatus: 'answering',
    selectedAnswerId: null,
    startedAt: null,
    pointsAwarded: null,
    isIncomplete: false,
  });
  const [showExitModal, setShowExitModal] = useState(false);
  const [isVerifyingAnswer, setIsVerifyingAnswer] = useState(false);

  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  const isGuest = userId === null;
  const { violations, violationsCount, resetViolations } = useAntiCheat(
    state.status === 'in_progress'
  );
  const currentQuestion = questions[state.currentIndex];
  const totalQuestions = questions.length;

  const handleRestoreSession = useCallback((data: QuizSessionData) => {
    dispatch({ type: 'RESTORE_SESSION', payload: data });
  }, []);

  useQuizSession({
    quizId,
    state,
    onRestore: handleRestoreSession,
  });

  const { markQuitting } = useQuizGuards({
    quizId,
    status: state.status,
    onExit: () => {
      router.back();
    },
    resetViolations,
  });

  useEffect(() => {
    if (!searchParams.has('seed')) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('seed', seed.toString());
      router.replace(`?${params.toString()}`, { scroll: false });
    }
  }, [seed, searchParams, router]);

  const handleStart = async () => {
    setIsStarting(true);
    try {
      const result = await initializeQuizCache(quizId);

      if (!result.success) {
        toast.error('Failed to start quiz session');
        setIsStarting(false);
        return;
      }

      window.history.pushState({ quizGuard: true }, '');
      dispatch({ type: 'START_QUIZ' });
    } catch {
      toast.error('Failed to start quiz session');
      setIsStarting(false);
    }
  };

  const verifyAnswer = async (answerId: string) => {
    const response = await fetch('/api/quiz/verify-answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questionId: currentQuestion.id,
        selectedAnswerId: answerId,
        quizId,
        timeLimitSeconds,
      }),
    });

    if (!response.ok) {
      throw new Error('Verify answer failed');
    }

    const data = await response.json();

    if (typeof data.isCorrect !== 'boolean') {
      throw new Error('Invalid verify response');
    }

    return data.isCorrect;
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const handleAnswer = async (answerId: string) => {
    if (state.questionStatus !== 'answering') return;
    if (isVerifyingAnswer) return;

    setIsVerifyingAnswer(true);

    const maxRetries = 1;
    let attempt = 0;

    try {
      while (true) {
        try {
          const isCorrect = await verifyAnswer(answerId);

          dispatch({
            type: 'ANSWER_SELECTED',
            payload: {
              answerId,
              isCorrect,
              questionId: currentQuestion.id,
            },
          });
          return;
        } catch {
          if (attempt >= maxRetries) {
            toast.error(tQuestion('verifyFailed'));
            return;
          }
          attempt += 1;
          toast(tQuestion('verifyRetry'));
          await sleep(600);
        }
      }
    } finally {
      setIsVerifyingAnswer(false);
    }
  };

  const handleNext = () => {
    if (state.currentIndex + 1 >= totalQuestions) {
      handleSubmit();
    } else {
      dispatch({ type: 'NEXT_QUESTION' });
    }
  };

  const handleSubmit = () => {
    const isIncomplete = state.answers.length < totalQuestions;
    if (!isGuest) {
      clearQuizSession(quizId);
    }
    const correctAnswers = state.answers.filter(a => a.isCorrect).length;
    const percentage = (correctAnswers / totalQuestions) * 100;
    const timeSpentSeconds = state.startedAt
      ? Math.floor((Date.now() - state.startedAt.getTime()) / 1000)
      : 0;

    if (isIncomplete) {
      dispatch({ type: 'COMPLETE_QUIZ', payload: { isIncomplete: true } });
      return;
    }

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
        violations: violations.map(v => ({
          type: v.type,
          timestamp: v.timestamp.getTime(),
        })),
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
          payload: { pointsAwarded: result.pointsAwarded ?? 0 },
        });
      } else {
        console.error('Failed to submit quiz:', result.error);
        dispatch({ type: 'COMPLETE_QUIZ' });
      }
    });
  };

  const handleRestart = () => {
    clearQuizSession(quizId);
    resetViolations();
    setIsStarting(false);
    dispatch({ type: 'RESTART' });
  };

  const handleQuit = () => {
    setShowExitModal(true);
  };

  const confirmQuit = () => {
    markQuitting();
    clearQuizSession(quizId);
    resetViolations();
    const categoryParam = categorySlug ? `?category=${categorySlug}` : '';
    window.location.href = `/${locale}/quizzes${categoryParam}`;
  };

  const handleTimeUp = () => {
    handleSubmit();
  };

  const handleBackToTopicsClick = () => {
    if (onBackToTopics) {
      onBackToTopics();
    } else {
      window.location.href = `/${locale}/q&a`;
    }
  };

  if (state.status === 'rules') {
    return (
      <div className="mx-auto max-w-2xl space-y-6 rounded-xl border border-gray-200 p-6 dark:border-gray-800">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {tRules('title')}
        </h2>

        <div className="space-y-4 text-gray-700 dark:text-gray-300">
          <div className="flex gap-3">
            <FileText
              className="mt-0.5 h-5 w-5 shrink-0 text-blue-500 dark:text-blue-400"
              aria-hidden="true"
            />
            <div>
              <p className="font-medium">{tRules('general.title')}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {tRules('general.description')}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Ban
              className="mt-0.5 h-5 w-5 shrink-0 text-red-500 dark:text-red-400"
              aria-hidden="true"
            />
            <div>
              <p className="font-medium">{tRules('forbidden.title')}</p>
              <ul className="list-inside list-disc space-y-1 text-sm text-gray-600 dark:text-gray-400">
                <li>{tRules('forbidden.copyPaste')}</li>
                <li>{tRules('forbidden.contextMenu')}</li>
                <li>{tRules('forbidden.tabSwitch')}</li>
                <li>{tRules('forbidden.externalSources')}</li>
              </ul>
            </div>
          </div>

          <div className="flex gap-3">
            <TriangleAlert
              className="mt-0.5 h-5 w-5 shrink-0 text-amber-500 dark:text-amber-400"
              aria-hidden="true"
            />
            <div>
              <p className="font-medium">{tRules('control.title')}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {tRules('control.description')}
              </p>
            </div>
          </div>
        </div>
        {isGuest ? (
          <>
            <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
              <UserRound
                className="mt-0.5 h-5 w-5 shrink-0 text-amber-500 dark:text-amber-400"
                aria-hidden="true"
              />
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                {tRules('guestWarning')}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href={`/login?returnTo=/quiz/${quizSlug}`}
                className="flex-1"
              >
                <Button className="w-full">{tResult('loginButton')}</Button>
              </Link>
              <Link
                href={`/signup?returnTo=/quiz/${quizSlug}`}
                className="flex-1"
              >
                <Button variant="secondary" className="w-full">
                  {tResult('signupButton')}
                </Button>
              </Link>
              <button
                onClick={handleStart}
                disabled={isStarting}
                className="disabled:opacity-50 disabled:cursor-not-allowed flex-1 rounded-xl border px-6 py-3 text-center text-base font-semibold transition-all duration-300"
                style={{
                  borderColor: `${accentColor}50`,
                  backgroundColor: `${accentColor}15`,
                  color: accentColor,
                }}
              >
                {tRules('continueAsGuest')}
              </button>
            </div>
          </>
      ) : (
        <button
          onClick={handleStart}
          disabled={isStarting}
          className="disabled:opacity-50 disabled:cursor-not-allowed group relative w-full overflow-hidden rounded-xl border px-6 py-3 text-center text-base font-semibold transition-all duration-300"
          style={{
            borderColor: `${accentColor}50`,
            backgroundColor: `${accentColor}15`,
            color: accentColor,
          }}
        >
          {tRules('startButton')}
          <span
            className="pointer-events-none absolute top-1/2 left-1/2 h-[150%] w-[80%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 blur-[20px] transition-opacity duration-300 group-hover:opacity-30"
            style={{ backgroundColor: accentColor }}
          />
        </button>
      )}
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
        isIncomplete={state.isIncomplete}
        onRestart={handleRestart}
        onBackToTopics={handleBackToTopicsClick}
        isGuest={isGuest}
        quizSlug={quizSlug}
      />
    );
  }

  return (
    <div className="no-select space-y-8">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={handleQuit}
          className="gap-2 hover:border-red-500 hover:text-red-600 dark:hover:text-red-400"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
          {tExit('exitButton')}
        </Button>
      </div>
      <QuizProgress
        current={state.currentIndex}
        total={totalQuestions}
        answers={state.answers}
      />

      {(() => {
        const calculatedTime = timeLimitSeconds ?? totalQuestions * 30;
        return (
          <CountdownTimer
            timeLimitSeconds={calculatedTime}
            onTimeUp={handleTimeUp}
            isActive={state.status === 'in_progress'}
            startedAt={state.startedAt!}
          />
        );
      })()}

      <QuizQuestion
        question={currentQuestion}
        status={state.questionStatus}
        selectedAnswerId={state.selectedAnswerId}
        isCorrect={
          state.answers.find(a => a.questionId === currentQuestion.id)
            ?.isCorrect ?? false
        }
        onAnswer={handleAnswer}
        onNext={handleNext}
        isLoading={isPending}
        accentColor={accentColor}
      />
      <ConfirmModal
        isOpen={showExitModal}
        title={tExit('title')}
        message={tExit('message')}
        confirmText={tExit('confirm')}
        cancelText={tExit('cancel')}
        variant="danger"
        onConfirm={confirmQuit}
        onCancel={() => setShowExitModal(false)}
      />
    </div>
  );
}
