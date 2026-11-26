import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import {
  quizAnswers,
  quizAnswerTranslations,
  quizQuestionContent,
  quizQuestions,
} from '@/db/schema/quiz';
import type { QuizAnswer, QuizQuestionWithAnswers } from '@/types/quiz';

const quizAnswerProjection = {
  id: quizAnswers.id,
  questionId: quizAnswers.quizQuestionId,
  displayOrder: quizAnswers.displayOrder,
  isCorrect: quizAnswers.isCorrect,
};

export function groupQuizAnswersByQuestion<
  Row extends { questionId: string },
  Answer,
>(
  rows: readonly Row[],
  mapAnswer: (row: Row) => Answer
): Map<string, Answer[]> {
  const groups = new Map<string, Answer[]>();
  for (const row of rows) {
    const answer = mapAnswer(row);
    const group = groups.get(row.questionId);
    if (group) {
      group.push(answer);
    } else {
      groups.set(row.questionId, [answer]);
    }
  }
  return groups;
}

export function getQuizAnswerRows(questionIds: string[]) {
  return db
    .select(quizAnswerProjection)
    .from(quizAnswers)
    .where(inArray(quizAnswers.quizQuestionId, questionIds))
    .orderBy(quizAnswers.displayOrder);
}

export async function getLocalizedQuizAnswersByQuestion(
  questionIds: string[],
  locale: string
): Promise<Map<string, QuizAnswer[]>> {
  const rows = await db
    .select({
      ...quizAnswerProjection,
      answerText: quizAnswerTranslations.answerText,
    })
    .from(quizAnswers)
    .leftJoin(
      quizAnswerTranslations,
      and(
        eq(quizAnswerTranslations.quizAnswerId, quizAnswers.id),
        eq(quizAnswerTranslations.locale, locale)
      )
    )
    .where(inArray(quizAnswers.quizQuestionId, questionIds))
    .orderBy(quizAnswers.displayOrder);

  return groupQuizAnswersByQuestion(rows, row => ({
    id: row.id,
    displayOrder: row.displayOrder,
    isCorrect: row.isCorrect,
    answerText: row.answerText,
  }));
}

export async function loadLocalizedQuizQuestions(
  quizId: string,
  locale: string
): Promise<QuizQuestionWithAnswers[]> {
  const questions = await db
    .select({
      id: quizQuestions.id,
      displayOrder: quizQuestions.displayOrder,
      difficulty: quizQuestions.difficulty,
      questionText: quizQuestionContent.questionText,
      explanation: quizQuestionContent.explanation,
    })
    .from(quizQuestions)
    .leftJoin(
      quizQuestionContent,
      and(
        eq(quizQuestionContent.quizQuestionId, quizQuestions.id),
        eq(quizQuestionContent.locale, locale)
      )
    )
    .where(eq(quizQuestions.quizId, quizId))
    .orderBy(quizQuestions.displayOrder);

  if (questions.length === 0) return [];

  const answersByQuestion = await getLocalizedQuizAnswersByQuestion(
    questions.map(question => question.id),
    locale
  );

  return questions.map(question => ({
    ...question,
    answers: answersByQuestion.get(question.id) ?? [],
  }));
}
