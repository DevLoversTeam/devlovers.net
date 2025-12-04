'use client';

  import { useReducer, useTransition } from 'react';
  import { QuizProgress } from './QuizProgress';
  import { QuizQuestion } from './QuizQuestion';
  import { QuizResult } from './QuizResult';
  import { submitQuizAttempt } from '@/actions/quiz';
  import type { QuizQuestionWithAnswers } from '@/db/queries/quiz';

  // =============================================================================
  // TYPES
  // =============================================================================

  interface Answer {
    questionId: string;
    selectedAnswerId: string;
    isCorrect: boolean;
    answeredAt: Date;
  }

  type QuizState = {
    status: 'in_progress' | 'completed';
    currentIndex: number;
    answers: Answer[];
    questionStatus: 'answering' | 'revealed';
    selectedAnswerId: string | null;
    startedAt: Date;
  };

  type QuizAction =
    | { type: 'ANSWER_SELECTED'; payload: { answerId: string; isCorrect: boolean; questionId: string } }
    | { type: 'NEXT_QUESTION' }
    | { type: 'COMPLETE_QUIZ' }
    | { type: 'RESTART' };

  // =============================================================================
  // REDUCER
  // =============================================================================

  function quizReducer(state: QuizState, action: QuizAction): QuizState {
    switch (action.type) {
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
        };

      case 'RESTART':
        return {
          status: 'in_progress',
          currentIndex: 0,
          answers: [],
          questionStatus: 'answering',
          selectedAnswerId: null,
          startedAt: new Date(),
        };

      default:
        return state;
    }
  }

  // =============================================================================
  // COMPONENT
  // =============================================================================

  interface QuizContainerProps {
    quizId: string;
    questions: QuizQuestionWithAnswers[];
    userId: string;
    onBackToTopics?: () => void;
  }

  export function QuizContainer({
    quizId,
    questions,
    userId,
    onBackToTopics,
  }: QuizContainerProps) {
    const [isPending, startTransition] = useTransition();

    const [state, dispatch] = useReducer(quizReducer, {
      status: 'in_progress',
      currentIndex: 0,
      answers: [],
      questionStatus: 'answering',
      selectedAnswerId: null,
      startedAt: new Date(),
    });

    const currentQuestion = questions[state.currentIndex];
    const totalQuestions = questions.length;

    // Handle answer selection
    const handleAnswer = (answerId: string) => {
      const correctAnswer = currentQuestion.answers.find((a) => a.isCorrect);
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

    // Handle next question
    const handleNext = () => {
      if (state.currentIndex + 1 >= totalQuestions) {
        // Last question - submit quiz
        handleSubmit();
      } else {
        // Move to next question
        dispatch({ type: 'NEXT_QUESTION' });
      }
    };

    // Submit quiz attempt to server
    const handleSubmit = () => {
      startTransition(async () => {
        const result = await submitQuizAttempt({
          userId,
          quizId,
          answers: state.answers,
          violations: [], // TODO: integrate anti-cheat hook
          startedAt: state.startedAt,
          completedAt: new Date(),
        });

        if (result.success) {
          dispatch({ type: 'COMPLETE_QUIZ' });
        } else {
          console.error('Failed to submit quiz:', result.error);
          // Still show result, but log error
          dispatch({ type: 'COMPLETE_QUIZ' });
        }
      });
    };

    // Handle restart
    const handleRestart = () => {
      dispatch({ type: 'RESTART' });
    };

    // Handle back to topics
    const handleBackToTopicsClick = () => {
      if (onBackToTopics) {
        onBackToTopics();
      } else {
        window.location.href = '/';
      }
    };

    // Show result if completed
    if (state.status === 'completed') {
      const correctAnswers = state.answers.filter((a) => a.isCorrect).length;
      const percentage = (correctAnswers / totalQuestions) * 100;

      return (
        <QuizResult
          score={correctAnswers}
          total={totalQuestions}
          percentage={percentage}
          onRestart={handleRestart}
          onBackToTopics={handleBackToTopicsClick}
        />
      );
    }

    // Show quiz in progress
    return (
      <div className="space-y-8">
        {/* Progress indicator */}
        <QuizProgress
          current={state.currentIndex}
          total={totalQuestions}
          answers={state.answers}
        />

        {/* Current question */}
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