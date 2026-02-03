import 'dotenv/config';

import { eq } from 'drizzle-orm';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { db } from './index';
import { categories } from './schema/categories';
import {
  quizAnswers,
  quizAnswerTranslations,
  quizAttempts,
  quizQuestionContent,
  quizQuestions,
  quizTranslations,
  quizzes,
} from './schema/quiz';

type Locale = 'uk' | 'en' | 'pl';
const LOCALES: Locale[] = ['uk', 'en', 'pl'];

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CATEGORY_SLUG = 'react';

interface QuizMetadata {
  quizId: string;
  slug: string;
  questionsCount: number;
  timeLimitSeconds: number;
  translations: Record<Locale, { title: string; description: string }>;
  questions: QuestionData[];
}

interface QuestionData {
  id: string;
  order: number;
  difficulty: 'beginner' | 'medium' | 'advanced';
  uk: { q: string; exp: string };
  en: { q: string; exp: string };
  pl: { q: string; exp: string };
  answers: {
    uk: string;
    en: string;
    pl: string;
    correct: boolean;
  }[];
}

function createExplanation(text: string) {
  return [{ type: 'paragraph' as const, children: [{ text }] }];
}

async function seedQuizFromJson() {
  console.log('Loading quiz data from JSON files...');

  const part1Path = join(__dirname, '../data/react-quiz-data-part1.json');
  const part2Path = join(__dirname, '../data/react-quiz-data-part2.json');

  const part1: QuizMetadata = JSON.parse(readFileSync(part1Path, 'utf-8'));
  const part2: { questions: QuestionData[] } = JSON.parse(
    readFileSync(part2Path, 'utf-8')
  );

  const allQuestions = [...part1.questions, ...part2.questions];
  console.log(`Loaded ${allQuestions.length} questions`);

  try {
    const [category] = await db
      .select()
      .from(categories)
      .where(eq(categories.slug, CATEGORY_SLUG))
      .limit(1);

    if (!category) {
      throw new Error(
        `Category "${CATEGORY_SLUG}" not found. Run seed:categories first.`
      );
    }

    console.log('Cleaning up old quiz...');
    const existing = await db.query.quizzes.findFirst({
      where: eq(quizzes.slug, part1.slug),
    });
    let quizId: string;
    if (existing) {
      const existingAttempt = await db.query.quizAttempts.findFirst({
        where: eq(quizAttempts.quizId, existing.id),
      });
      if (existingAttempt) {
        throw new Error(
          `Quiz ${part1.slug} has existing attempts. Aborting to avoid data loss.`
        );
      }

      await db
        .delete(quizQuestions)
        .where(eq(quizQuestions.quizId, existing.id));
      await db
        .delete(quizTranslations)
        .where(eq(quizTranslations.quizId, existing.id));
      await db
        .update(quizzes)
        .set({
          categoryId: category.id,
          slug: part1.slug,
          displayOrder: 1,
          questionsCount: part1.questionsCount,
          timeLimitSeconds: part1.timeLimitSeconds,
          isActive: true,
        })
        .where(eq(quizzes.id, existing.id));
      quizId = existing.id;
    } else {
      console.log('Creating quiz...');
      const [quiz] = await db
        .insert(quizzes)
        .values({
          categoryId: category.id,
          slug: part1.slug,
          displayOrder: 1,
          questionsCount: part1.questionsCount,
          timeLimitSeconds: part1.timeLimitSeconds,
          isActive: true,
        })
        .returning();
      quizId = quiz.id;
    }
    console.log('Creating quiz translations...');
    for (const locale of LOCALES) {
      await db.insert(quizTranslations).values({
        quizId,
        locale,
        title: part1.translations[locale].title,
        description: part1.translations[locale].description,
      });
    }

    console.log('Creating questions...');
    for (const question of allQuestions) {
      const [q] = await db
        .insert(quizQuestions)
        .values({
          quizId,
          displayOrder: question.order,
          difficulty: question.difficulty,
        })
        .returning();

      for (const locale of LOCALES) {
        await db.insert(quizQuestionContent).values({
          quizQuestionId: q.id,
          locale,
          questionText: question[locale].q,
          explanation: createExplanation(question[locale].exp),
        });
      }

      for (let i = 0; i < question.answers.length; i++) {
        const answer = question.answers[i];

        const [a] = await db
          .insert(quizAnswers)
          .values({
            quizQuestionId: q.id,
            displayOrder: i + 1,
            isCorrect: answer.correct,
          })
          .returning();

        for (const locale of LOCALES) {
          await db.insert(quizAnswerTranslations).values({
            quizAnswerId: a.id,
            locale,
            answerText: answer[locale],
          });
        }
      }

      if (question.order % 10 === 0) {
        console.log(`Progress: ${question.order}/${allQuestions.length}`);
      }
    }

    console.log('Done');
    console.log(`Quiz ID: ${quizId}`);
    console.log(`Questions: ${allQuestions.length}`);
    console.log(`Answers: ${allQuestions.length * 4}`);
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

seedQuizFromJson()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
