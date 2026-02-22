import { eq, inArray, sql } from 'drizzle-orm';

import { db } from '../../index';
import { categories, categoryTranslations } from '../../schema/categories';
import {
  quizQuestions,
  quizTranslations,
  quizzes,
  quizAnswers,
  quizAnswerTranslations,
  quizQuestionContent,
} from '../../schema/quiz';

const ADMIN_LOCALE = 'en';

export interface AdminQuizListItem {
  id: string;
  slug: string;
  title: string | null;
  categoryName: string | null;
  questionsCount: number;
  attemptCount: number;
  isActive: boolean;
  status: string;
  createdAt: Date;
}

export async function getAdminQuizList(): Promise<AdminQuizListItem[]> {
  const rows = await db
    .select({
      id: quizzes.id,
      slug: quizzes.slug,
      title: quizTranslations.title,
      categoryName: categoryTranslations.title,
      questionsCount: sql<number>`(
        SELECT COUNT(*)::int FROM quiz_questions WHERE quiz_id = ${quizzes.id}
      )`,
      attemptCount: sql<number>`(
        SELECT COUNT(*)::int FROM quiz_attempts WHERE quiz_id = ${quizzes.id}
      )`,
      status: quizzes.status,
      isActive: quizzes.isActive,
      createdAt: quizzes.createdAt,
    })
    .from(quizzes)
    .leftJoin(
      quizTranslations,
      sql`${quizTranslations.quizId} = ${quizzes.id} AND ${quizTranslations.locale} = ${ADMIN_LOCALE}`
    )
    .leftJoin(categories, eq(categories.id, quizzes.categoryId))
    .leftJoin(
      categoryTranslations,
      sql`${categoryTranslations.categoryId} = ${categories.id} AND ${categoryTranslations.locale} = ${ADMIN_LOCALE}`
    )
    .orderBy(categories.displayOrder, quizzes.displayOrder);

  return rows;
}

// ── Types for quiz editor ──

export interface AdminQuizTranslation {
  title: string;
  description: string | null;
}

export interface AdminQuizAnswer {
  id: string;
  displayOrder: number;
  isCorrect: boolean;
  translations: Record<string, { answerText: string }>;
}

export interface AdminQuizQuestion {
  id: string;
  displayOrder: number;
  difficulty: string | null;
  content: Record<string, { questionText: string; explanation: unknown }>;
  answers: AdminQuizAnswer[];
}

export interface AdminQuizFull {
  id: string;
  slug: string;
  questionsCount: number;
  timeLimitSeconds: number | null;
  status: string;
  isActive: boolean;
  categoryId: string;
  translations: Record<string, AdminQuizTranslation>;
  questions: AdminQuizQuestion[];
}

// ── Query ──

export async function getAdminQuizFull(
  quizId: string
): Promise<AdminQuizFull | null> {
  // 1. Quiz base data
  const [quiz] = await db
    .select({
      id: quizzes.id,
      slug: quizzes.slug,
      status: quizzes.status,
      questionsCount: quizzes.questionsCount,
      timeLimitSeconds: quizzes.timeLimitSeconds,
      isActive: quizzes.isActive,
      categoryId: quizzes.categoryId,
    })
    .from(quizzes)
    .where(eq(quizzes.id, quizId))
    .limit(1);

  if (!quiz) return null;

  // 2. Quiz translations (all locales)
  const quizTrans = await db
    .select({
      locale: quizTranslations.locale,
      title: quizTranslations.title,
      description: quizTranslations.description,
    })
    .from(quizTranslations)
    .where(eq(quizTranslations.quizId, quizId));

  const translations: Record<string, AdminQuizTranslation> = {};
  for (const t of quizTrans) {
    translations[t.locale] = { title: t.title, description: t.description };
  }

  // 3. Questions
  const questionsData = await db
    .select({
      id: quizQuestions.id,
      displayOrder: quizQuestions.displayOrder,
      difficulty: quizQuestions.difficulty,
    })
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quizId))
    .orderBy(quizQuestions.displayOrder);

  if (questionsData.length === 0) {
    return { ...quiz, translations, questions: [] };
  }

  const questionIds = questionsData.map(q => q.id);

  // 4. Question content (all locales)
  const contentRows = await db
    .select({
      quizQuestionId: quizQuestionContent.quizQuestionId,
      locale: quizQuestionContent.locale,
      questionText: quizQuestionContent.questionText,
      explanation: quizQuestionContent.explanation,
    })
    .from(quizQuestionContent)
    .where(inArray(quizQuestionContent.quizQuestionId, questionIds));

  const contentByQuestion = new Map<
    string,
    Record<string, { questionText: string; explanation: unknown }>
  >();
  for (const row of contentRows) {
    let map = contentByQuestion.get(row.quizQuestionId);
    if (!map) {
      map = {};
      contentByQuestion.set(row.quizQuestionId, map);
    }
    map[row.locale] = {
      questionText: row.questionText,
      explanation: row.explanation,
    };
  }

  // 5. Answers + translations (all locales)
  const answersData = await db
    .select({
      id: quizAnswers.id,
      quizQuestionId: quizAnswers.quizQuestionId,
      displayOrder: quizAnswers.displayOrder,
      isCorrect: quizAnswers.isCorrect,
    })
    .from(quizAnswers)
    .where(inArray(quizAnswers.quizQuestionId, questionIds))
    .orderBy(quizAnswers.displayOrder);

  const answerIds = answersData.map(a => a.id);

  const answerTransRows =
    answerIds.length > 0
      ? await db
          .select({
            quizAnswerId: quizAnswerTranslations.quizAnswerId,
            locale: quizAnswerTranslations.locale,
            answerText: quizAnswerTranslations.answerText,
          })
          .from(quizAnswerTranslations)
          .where(inArray(quizAnswerTranslations.quizAnswerId, answerIds))
      : [];

  const transById = new Map<string, Record<string, { answerText: string }>>();
  for (const row of answerTransRows) {
    let map = transById.get(row.quizAnswerId);
    if (!map) {
      map = {};
      transById.set(row.quizAnswerId, map);
    }
    map[row.locale] = { answerText: row.answerText };
  }

  // 6. Group answers by question
  const answersByQuestion = new Map<string, AdminQuizAnswer[]>();
  for (const a of answersData) {
    const arr = answersByQuestion.get(a.quizQuestionId) ?? [];
    arr.push({
      id: a.id,
      displayOrder: a.displayOrder,
      isCorrect: a.isCorrect,
      translations: transById.get(a.id) ?? {},
    });
    answersByQuestion.set(a.quizQuestionId, arr);
  }

  // 7. Assemble questions
  const questions: AdminQuizQuestion[] = questionsData.map(q => ({
    id: q.id,
    displayOrder: q.displayOrder,
    difficulty: q.difficulty,
    content: contentByQuestion.get(q.id) ?? {},
    answers: answersByQuestion.get(q.id) ?? [],
  }));

  return { ...quiz, translations, questions };
}
