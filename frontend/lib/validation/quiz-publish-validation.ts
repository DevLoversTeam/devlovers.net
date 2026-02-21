import { eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import {
  quizAnswers,
  quizAnswerTranslations,
  quizQuestionContent,
  quizQuestions,
  quizTranslations,
} from '@/db/schema/quiz';

const LOCALES = ['en', 'uk', 'pl'];

export async function validateQuizForPublish(quizId: string): Promise<string[]> {
  const errors: string[] = [];

  // 1. Quiz translations
  const quizTrans = await db
    .select({ locale: quizTranslations.locale, title: quizTranslations.title, description: quizTranslations.description })
    .from(quizTranslations)
    .where(eq(quizTranslations.quizId, quizId));

  const quizLocales = new Set(quizTrans.map(t => t.locale));
  for (const locale of LOCALES) {
    if (!quizLocales.has(locale)) {
      errors.push(`Quiz missing translation for locale: ${locale}`);
    }
  }
  for (const t of quizTrans) {
    if (!t.title) errors.push(`Quiz title empty for locale: ${t.locale}`);
    if (!t.description) errors.push(`Quiz description empty for locale: ${t.locale}`);
  }

  // 2. Questions
  const questions = await db
    .select({ id: quizQuestions.id, displayOrder: quizQuestions.displayOrder })
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quizId))
    .orderBy(quizQuestions.displayOrder);

  if (questions.length === 0) {
    errors.push('Quiz has no questions');
    return errors;
  }

  const questionIds = questions.map(q => q.id);

  // 3. Question content (all locales)
  const contentRows = await db
    .select({
      quizQuestionId: quizQuestionContent.quizQuestionId,
      locale: quizQuestionContent.locale,
      questionText: quizQuestionContent.questionText,
      explanation: quizQuestionContent.explanation,
    })
    .from(quizQuestionContent)
    .where(inArray(quizQuestionContent.quizQuestionId, questionIds));

  const contentMap = new Map<string, Set<string>>();
  for (const row of contentRows) {
    if (!contentMap.has(row.quizQuestionId)) contentMap.set(row.quizQuestionId, new Set());
    contentMap.get(row.quizQuestionId)!.add(row.locale);

    if (!row.questionText) errors.push(`Q${questions.findIndex(q => q.id === row.quizQuestionId) + 1}: questionText empty (${row.locale})`);
    if (!row.explanation || (Array.isArray(row.explanation) && row.explanation.length === 0)) {
      errors.push(`Q${questions.findIndex(q => q.id === row.quizQuestionId) + 1}: explanation empty (${row.locale})`);
    }
  }

  for (let i = 0; i < questions.length; i++) {
    const locales = contentMap.get(questions[i].id);
    for (const locale of LOCALES) {
      if (!locales?.has(locale)) {
        errors.push(`Q${i + 1}: missing content for locale: ${locale}`);
      }
    }
  }

  // 4. Answers
  const answers = await db
    .select({ id: quizAnswers.id, quizQuestionId: quizAnswers.quizQuestionId, isCorrect: quizAnswers.isCorrect })
    .from(quizAnswers)
    .where(inArray(quizAnswers.quizQuestionId, questionIds));

  const answersByQuestion = new Map<string, typeof answers>();
  for (const a of answers) {
    if (!answersByQuestion.has(a.quizQuestionId)) answersByQuestion.set(a.quizQuestionId, []);
    answersByQuestion.get(a.quizQuestionId)!.push(a);
  }

  for (let i = 0; i < questions.length; i++) {
    const qAnswers = answersByQuestion.get(questions[i].id) ?? [];
    const correctCount = qAnswers.filter(a => a.isCorrect).length;
    if (correctCount !== 1) {
      errors.push(`Q${i + 1}: expected 1 correct answer, found ${correctCount}`);
    }
  }

  // 5. Answer translations
  const answerIds = answers.map(a => a.id);
  const answerTransRows = answerIds.length > 0
    ? await db
        .select({ quizAnswerId: quizAnswerTranslations.quizAnswerId, locale: quizAnswerTranslations.locale, answerText: quizAnswerTranslations.answerText })
        .from(quizAnswerTranslations)
        .where(inArray(quizAnswerTranslations.quizAnswerId, answerIds))
    : [];

  const answerTransMap = new Map<string, Set<string>>();
  for (const row of answerTransRows) {
    if (!answerTransMap.has(row.quizAnswerId)) answerTransMap.set(row.quizAnswerId, new Set());
    answerTransMap.get(row.quizAnswerId)!.add(row.locale);
    if (!row.answerText) errors.push(`Answer ${row.quizAnswerId}: answerText empty (${row.locale})`);
  }

  for (const a of answers) {
    const locales = answerTransMap.get(a.id);
    for (const locale of LOCALES) {
      if (!locales?.has(locale)) {
        const qIdx = questions.findIndex(q => q.id === a.quizQuestionId) + 1;
        errors.push(`Q${qIdx}: answer missing translation for locale: ${locale}`);
      }
    }
  }

  return errors;
}
