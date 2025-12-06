import { db } from '../index';
  import {
    quizzes,
    quizTranslations,
    quizQuestions,
    quizQuestionContent,
    quizAnswers,
    quizAnswerTranslations,
    quizAttempts,
    quizAttemptAnswers
  } from '../schema/quiz';
  import { eq, and, desc, sql } from 'drizzle-orm';

  // =============================================================================
  // TYPES
  // =============================================================================

  export interface Quiz {
    id: string;
    slug: string;
    title: string | null;
    description: string | null;
    questionsCount: number;
    timeLimitSeconds: number | null;
    isActive: boolean;
  }

  export interface QuizQuestion {
    id: string;
    displayOrder: number;
    difficulty: string | null;
    questionText: string | null;
    explanation: any; // JSONB
  }

  export interface QuizAnswer {
    id: string;
    displayOrder: number;
    isCorrect: boolean;
    answerText: string | null;
  }

  export interface QuizQuestionWithAnswers extends QuizQuestion {
    answers: QuizAnswer[];
  }

  export interface LeaderboardEntry {
    rank: number;
    userId: string;
    percentage: string;
    completedAt: Date;
    attemptsCount: number;
  }

  export interface QuizAttempt {
    id: string;
    userId: string;
    quizId: string;
    score: number;
    totalQuestions: number;
    percentage: string;
    timeSpentSeconds: number | null;
    integrityScore: number | null;
    completedAt: Date;
  }

  // =============================================================================
  // QUIZ QUERIES
  // =============================================================================

  /**
   * Get quiz by slug with translation for specific locale
   */
  export async function getQuizBySlug(slug: string, locale: string = 'uk'):
  Promise<Quiz | null> {
    const result = await db
      .select({
        id: quizzes.id,
        slug: quizzes.slug,
        questionsCount: quizzes.questionsCount,
        timeLimitSeconds: quizzes.timeLimitSeconds,
        isActive: quizzes.isActive,
        title: quizTranslations.title,
        description: quizTranslations.description,
      })
      .from(quizzes)
      .leftJoin(quizTranslations, and(
        eq(quizTranslations.quizId, quizzes.id),
        eq(quizTranslations.locale, locale)
      ))
      .where(eq(quizzes.slug, slug))
      .limit(1);

    if (!result.length) return null;

    return result[0];
  }

  /**
   * Get quiz questions with content and answers for specific locale
   * Returns questions in display order (can be randomized by caller)
   */
  export async function getQuizQuestions(
    quizId: string,
    locale: string = 'uk'
  ): Promise<QuizQuestionWithAnswers[]> {
    // 1. Get questions with content
    const questionsData = await db
      .select({
        id: quizQuestions.id,
        displayOrder: quizQuestions.displayOrder,
        difficulty: quizQuestions.difficulty,
        questionText: quizQuestionContent.questionText,
        explanation: quizQuestionContent.explanation,
      })
      .from(quizQuestions)
      .leftJoin(quizQuestionContent, and(
        eq(quizQuestionContent.quizQuestionId, quizQuestions.id),
        eq(quizQuestionContent.locale, locale)
      ))
      .where(eq(quizQuestions.quizId, quizId))
      .orderBy(quizQuestions.displayOrder);

    // 2. Get answers for each question
    const questions = await Promise.all(
      questionsData.map(async (question) => {
        const answersData = await db
          .select({
            id: quizAnswers.id,
            displayOrder: quizAnswers.displayOrder,
            isCorrect: quizAnswers.isCorrect,
            answerText: quizAnswerTranslations.answerText,
          })
          .from(quizAnswers)
          .leftJoin(quizAnswerTranslations, and(
            eq(quizAnswerTranslations.quizAnswerId, quizAnswers.id),
            eq(quizAnswerTranslations.locale, locale)
          ))
          .where(eq(quizAnswers.quizQuestionId, question.id))
          .orderBy(quizAnswers.displayOrder);

        return {
          ...question,
          answers: answersData,
        };
      })
    );

    return questions;
  }

  /**
   * Randomize questions and answers using a seed
   * This ensures the same user gets the same order on retries
   */
  export function randomizeQuizQuestions(
    questions: QuizQuestionWithAnswers[],
    seed?: number
  ): QuizQuestionWithAnswers[] {
    // Simple seeded shuffle using Math.sin
    const seededRandom = (index: number) => {
      const x = Math.sin(seed ? seed + index : index) * 10000;
      return x - Math.floor(x);
    };

    // Shuffle questions
    const shuffledQuestions = [...questions]
      .map((q, i) => ({ question: q, sort: seededRandom(i) }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ question }) => question);

    // Shuffle answers in each question
    return shuffledQuestions.map((question, qIndex) => ({
      ...question,
      answers: [...question.answers]
        .map((a, i) => ({ answer: a, sort: seededRandom(qIndex * 100 + i) }))
        .sort((a, b) => a.sort - b.sort)
        .map(({ answer }) => answer),
    }));
  }

  /**
   * Get quiz questions with randomized order
   */
  export async function getQuizQuestionsRandomized(
    quizId: string,
    locale: string = 'uk',
    seed?: number
  ): Promise<QuizQuestionWithAnswers[]> {
    const questions = await getQuizQuestions(quizId, locale);
    return randomizeQuizQuestions(questions, seed);
  }

  // =============================================================================
  // LEADERBOARD & USER STATS
  // =============================================================================

  /**
   * Get quiz leaderboard (top scores with integrity >= 70)
   */
  export async function getQuizLeaderboard(
    quizId: string,
    limit: number = 10
  ): Promise<LeaderboardEntry[]> {
    const leaderboard = await db
      .select({
        userId: quizAttempts.userId,
        percentage: quizAttempts.percentage,
        completedAt: quizAttempts.completedAt,
        integrityScore: quizAttempts.integrityScore,
      })
      .from(quizAttempts)
      .where(
        and(
          eq(quizAttempts.quizId, quizId),
          sql`${quizAttempts.integrityScore} >= 70` // Only fair attempts
        )
      )
      .orderBy(
        desc(quizAttempts.percentage),
        quizAttempts.completedAt
      )
      .limit(limit);

    // Add rank and count attempts per user
    return leaderboard.map((entry, index) => ({
      rank: index + 1,
      userId: entry.userId,
      percentage: entry.percentage,
      completedAt: entry.completedAt,
      attemptsCount: 1, // TODO: count actual attempts
    }));
  }

  /**
   * Get user's best attempt for a quiz
   */
  export async function getUserBestAttempt(
    userId: string,
    quizId: string
  ): Promise<QuizAttempt | null> {
    const result = await db
      .select()
      .from(quizAttempts)
      .where(
        and(
          eq(quizAttempts.userId, userId),
          eq(quizAttempts.quizId, quizId)
        )
      )
      .orderBy(desc(quizAttempts.percentage))
      .limit(1);

    if (!result.length) return null;

    return result[0] as QuizAttempt;
  }

  /**
   * Get user's quiz history (all attempts)
   */
  export async function getUserQuizHistory(
    userId: string,
    quizId: string
  ): Promise<QuizAttempt[]> {
    const attempts = await db
      .select()
      .from(quizAttempts)
      .where(
        and(
          eq(quizAttempts.userId, userId),
          eq(quizAttempts.quizId, quizId)
        )
      )
      .orderBy(desc(quizAttempts.completedAt));

    return attempts as QuizAttempt[];
  }

  /**
   * Get attempt details with user answers
   */
  export async function getAttemptDetails(attemptId: string) {
    const attempt = await db
      .select()
      .from(quizAttempts)
      .where(eq(quizAttempts.id, attemptId))
      .limit(1);

    if (!attempt.length) return null;

    const answers = await db
      .select()
      .from(quizAttemptAnswers)
      .where(eq(quizAttemptAnswers.attemptId, attemptId));

    return {
      attempt: attempt[0],
      answers,
    };
  }