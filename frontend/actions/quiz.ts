  'use server';

  import { db } from '@/db';
  import { quizAttempts, quizAttemptAnswers, quizAnswers } from '@/db/schema/quiz';
  import { eq } from 'drizzle-orm';

  // =============================================================================
  // TYPES
  // =============================================================================

  export interface UserAnswer {
    questionId: string;
    selectedAnswerId: string;
    answeredAt: Date;
  }

  export interface ViolationEvent {
    type: 'copy' | 'context-menu' | 'tab-switch';
    timestamp: Date;
  }

  export interface SubmitQuizAttemptInput {
    userId: string;
    quizId: string;
    answers: UserAnswer[];
    violations: ViolationEvent[];
    startedAt: Date;
    completedAt: Date;
  }

  export interface SubmitQuizAttemptResult {
    success: boolean;
    attemptId?: string;
    score?: number;
    totalQuestions?: number;
    percentage?: number;
    integrityScore?: number;
    error?: string;
  }

  // =============================================================================
  // HELPER FUNCTIONS
  // =============================================================================

  /**
   * Calculate integrity score based on violations
   * Formula: 100 - (violations.length * 10), min 0
   */
  function calculateIntegrityScore(violations: ViolationEvent[]): number {
    const penalty = violations.length * 10;
    return Math.max(0, 100 - penalty);
  }

  /**
   * Validate minimum time spent per question (3 seconds)
   */
  function validateTimeSpent(
    startedAt: Date,
    completedAt: Date,
    questionCount: number
  ): boolean {
    const MIN_SECONDS_PER_QUESTION = 3;
    const timeSpentSeconds = Math.floor(
      (completedAt.getTime() - startedAt.getTime()) / 1000
    );
    const minRequiredTime = questionCount * MIN_SECONDS_PER_QUESTION;

    return timeSpentSeconds >= minRequiredTime;
  }

  /**
   * Check if selected answer is correct
   */
  async function isAnswerCorrect(answerId: string): Promise<boolean> {
    const answer = await db
      .select({ isCorrect: quizAnswers.isCorrect })
      .from(quizAnswers)
      .where(eq(quizAnswers.id, answerId))
      .limit(1);

    return answer.length > 0 && answer[0].isCorrect;
  }

  // =============================================================================
  // SERVER ACTION
  // =============================================================================

  /**
   * Submit quiz attempt and save results to database
   */
  export async function submitQuizAttempt(
    input: SubmitQuizAttemptInput
  ): Promise<SubmitQuizAttemptResult> {
    try {
      const { userId, quizId, answers, violations, startedAt, completedAt } =
        input;

      // 1. Validate input
      if (!userId || !quizId || !answers.length) {
        return {
          success: false,
          error: 'Invalid input: userId, quizId, and answers are required',
        };
      }

      // 2. Validate time spent (min 3 sec per question)
      const isValidTime = validateTimeSpent(startedAt, completedAt, answers.length);
      if (!isValidTime) {
        return {
          success: false,
          error: 'Invalid time spent: quiz completed too quickly',
        };
      }

      // 3. Calculate score and integrity
      let correctAnswersCount = 0;

      // Check each answer
      const answerResults = await Promise.all(
        answers.map(async (answer) => {
          const isCorrect = await isAnswerCorrect(answer.selectedAnswerId);
          if (isCorrect) correctAnswersCount++;
          return {
            questionId: answer.questionId,
            selectedAnswerId: answer.selectedAnswerId,
            isCorrect,
            answeredAt: answer.answeredAt,
          };
        })
      );

      const totalQuestions = answers.length;
      const percentage = ((correctAnswersCount / totalQuestions) * 100).toFixed(2);
      const integrityScore = calculateIntegrityScore(violations);
      const timeSpentSeconds = Math.floor(
        (completedAt.getTime() - startedAt.getTime()) / 1000
      );

      // 4. Save attempt to database
      const [attempt] = await db
        .insert(quizAttempts)
        .values({
          userId,
          quizId,
          score: correctAnswersCount,
          totalQuestions,
          percentage,
          timeSpentSeconds,
          integrityScore,
          metadata: { violations }, // Store violations in metadata
          startedAt,
          completedAt,
        })
        .returning({ id: quizAttempts.id });

      // 5. Save individual answers
      await db.insert(quizAttemptAnswers).values(
        answerResults.map((result) => ({
          attemptId: attempt.id,
          quizQuestionId: result.questionId,
          selectedAnswerId: result.selectedAnswerId,
          isCorrect: result.isCorrect,
          answeredAt: result.answeredAt,
        }))
      );

      // 6. Return success result
      return {
        success: true,
        attemptId: attempt.id,
        score: correctAnswersCount,
        totalQuestions,
        percentage: parseFloat(percentage),
        integrityScore,
      };
    } catch (error) {
      console.error('Error submitting quiz attempt:', error);
      return {
        success: false,
        error: 'Failed to submit quiz attempt',
      };
    }
  }
