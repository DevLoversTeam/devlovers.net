import { db } from '@/db';
import {
  quizAnswers,
  quizAnswerTranslations,
  quizQuestionContent,
  quizQuestions,
} from '@/db/schema/quiz';
import { locales } from '@/i18n/config';
import type { JsonQuestion } from '@/lib/validation/admin-quiz';

type InsertedQuestion = { id: string; question: JsonQuestion };

export async function insertQuizQuestionRows(
  quizId: string,
  questions: readonly JsonQuestion[],
  getDisplayOrder: (question: JsonQuestion, index: number) => number
): Promise<InsertedQuestion[]> {
  const rows = await db
    .insert(quizQuestions)
    .values(
      questions.map((question, index) => ({
        quizId,
        displayOrder: getDisplayOrder(question, index),
        difficulty: question.difficulty,
      }))
    )
    .returning({ id: quizQuestions.id });

  return rows.map(({ id }, index) => ({ id, question: questions[index] }));
}

export async function insertQuizQuestionDetails(
  questions: readonly InsertedQuestion[]
): Promise<void> {
  await db.insert(quizQuestionContent).values(
    questions.flatMap(({ id, question }) =>
      locales.map(locale => ({
        quizQuestionId: id,
        locale,
        questionText: question[locale].q,
        explanation: [
          { type: 'paragraph', children: [{ text: question[locale].exp }] },
        ],
      }))
    )
  );

  const answers = questions.flatMap(({ id, question }) =>
    question.answers.map((answer, index) => ({
      row: {
        quizQuestionId: id,
        displayOrder: index + 1,
        isCorrect: answer.correct,
      },
      answer,
    }))
  );

  const answerRows = await db
    .insert(quizAnswers)
    .values(answers.map(({ row }) => row))
    .returning({ id: quizAnswers.id });

  await db.insert(quizAnswerTranslations).values(
    answerRows.flatMap(({ id }, index) =>
      locales.map(locale => ({
        quizAnswerId: id,
        locale,
        answerText: answers[index].answer[locale],
      }))
    )
  );
}
