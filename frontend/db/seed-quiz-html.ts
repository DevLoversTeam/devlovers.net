import { eq } from 'drizzle-orm';
import { readFileSync } from 'fs';
import { join } from 'path';
import { db } from './index';
import { categories } from './schema/categories';
import {
  quizzes,
  quizTranslations,
  quizQuestions,
  quizQuestionContent,
  quizAnswers,
  quizAnswerTranslations,
  quizAttempts,
} from './schema/quiz';

type Locale = 'uk' | 'en' | 'pl';
const LOCALES: Locale[] = ['uk', 'en', 'pl'];

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

interface QuizPartData {
  questions: QuestionData[];
}

const CATEGORY_SLUG = 'html';

const QUIZ_METADATA = {
  slug: 'html-fundamentals',
  questionsCount: 40,
  timeLimitSeconds: 1800,
  translations: {
    uk: {
      title: 'Основи HTML',
      description: 'Перевірте свої знання HTML: структура документа, теги, атрибути, форми, семантична розмітка та доступність.',
    },
    en: {
      title: 'HTML Fundamentals',
      description: 'Test your knowledge of HTML: document structure, tags, attributes, forms, semantic markup and accessibility.',
    },
    pl: {
      title: 'Podstawy HTML',
      description: 'Sprawdź swoją wiedzę o HTML: struktura dokumentu, tagi, atrybuty, formularze, semantyczne znaczniki i dostępność.',
    },
  },
};

function createExplanation(text: string) {
  return [{ type: 'paragraph' as const, children: [{ text }] }];
}

async function loadQuestions(partNumber: number): Promise<QuestionData[]> {
  const partPath = join(process.cwd(), 'parse', 'html', 'fundamentals', `html-quiz-part${partNumber}.json`);
  const partData: QuizPartData = JSON.parse(readFileSync(partPath, 'utf-8'));
  return partData.questions;
}

async function ensureQuizExists(): Promise<string> {
  console.log('Ensuring quiz exists...');

  // Find category by slug
  const [category] = await db
    .select()
    .from(categories)
    .where(eq(categories.slug, CATEGORY_SLUG))
    .limit(1);

  if (!category) {
    throw new Error(`Category "${CATEGORY_SLUG}" not found. Run seed:categories first.`);
  }

  // Clean up old quiz by slug
  const existing = await db.query.quizzes.findFirst({
    where: eq(quizzes.slug, QUIZ_METADATA.slug),
  });
  if (existing) {
    const existingAttempt = await db.query.quizAttempts.findFirst({
      where: eq(quizAttempts.quizId, existing.id),
    });
    if (existingAttempt) {
      throw new Error(`Quiz ${QUIZ_METADATA.slug} has existing attempts. Aborting to avoid data loss.`);
    }

    await db.delete(quizQuestions).where(eq(quizQuestions.quizId, existing.id));
    await db.delete(quizTranslations).where(eq(quizTranslations.quizId, existing.id));
    await db.update(quizzes).set({
      categoryId: category.id,
      slug: QUIZ_METADATA.slug,
      displayOrder: 1,
      questionsCount: QUIZ_METADATA.questionsCount,
      timeLimitSeconds: QUIZ_METADATA.timeLimitSeconds,
      isActive: true,
    }).where(eq(quizzes.id, existing.id));

    const quizId = existing.id;
    for (const locale of LOCALES) {
      await db.insert(quizTranslations).values({
        quizId,
        locale,
        title: QUIZ_METADATA.translations[locale].title,
        description: QUIZ_METADATA.translations[locale].description,
      });
    }

    return quizId;
  }

  const [quiz] = await db.insert(quizzes).values({
    categoryId: category.id,
    slug: QUIZ_METADATA.slug,
    displayOrder: 1,
    questionsCount: QUIZ_METADATA.questionsCount,
    timeLimitSeconds: QUIZ_METADATA.timeLimitSeconds,
    isActive: true,
  }).returning();

  for (const locale of LOCALES) {
    await db.insert(quizTranslations).values({
      quizId: quiz.id,
      locale,
      title: QUIZ_METADATA.translations[locale].title,
      description: QUIZ_METADATA.translations[locale].description,
    });
  }

  return quiz.id;
}

async function seedQuestions(questions: QuestionData[], quizId: string, partNumber: number) {
  console.log(`Seeding ${questions.length} questions from part ${partNumber}...`);

  for (const question of questions) {
    const [q] = await db.insert(quizQuestions).values({
      quizId,
      displayOrder: question.order,
      difficulty: question.difficulty,
    }).returning();

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
      
      const [a] = await db.insert(quizAnswers).values({
        quizQuestionId: q.id,
        displayOrder: i + 1,
        isCorrect: answer.correct,
      }).returning();

      for (const locale of LOCALES) {
        await db.insert(quizAnswerTranslations).values({
          quizAnswerId: a.id,
          locale,
          answerText: answer[locale],
        });
      }
    }
  }

  console.log(`Part ${partNumber} completed (${questions.length} questions)`);
}

async function seedQuizFromJson() {
  const args = process.argv.slice(2);
  const partArg = args[0];

  if (!partArg) {
    console.error('Error: Please specify which part to upload');
    console.log('Usage: npx tsx db/seeds/seed-quiz-html.ts <part-number>');
    console.log('Example: npx tsx db/seeds/seed-quiz-html.ts 1');
    console.log('Or upload all: npx tsx db/seeds/seed-quiz-html.ts all');
    process.exit(1);
  }

  console.log('Starting HTML quiz seed...\n');

  try {
    const quizId = await ensureQuizExists();

    if (partArg.toLowerCase() === 'all') {
      console.log('Uploading all parts...\n');
      let totalQuestions = 0;

      for (let i = 1; i <= 4; i++) {
        const questions = await loadQuestions(i);
        await seedQuestions(questions, quizId, i);
        totalQuestions += questions.length;
      }

      console.log('\nAll parts seeded successfully!');
      console.log(`   - 1 quiz with ${LOCALES.length} translations`);
      console.log(`   - ${totalQuestions} questions total`);
      console.log(`   - ${totalQuestions * 4} answers with ${LOCALES.length} translations each`);
    } else {
      const partNumber = parseInt(partArg, 10);

      if (isNaN(partNumber) || partNumber < 1 || partNumber > 4) {
        console.error('Error: Part number must be between 1 and 4');
        process.exit(1);
      }

      const questions = await loadQuestions(partNumber);
      await seedQuestions(questions, quizId, partNumber);

      console.log('\nPart seeded successfully!');
      console.log(`   - Quiz: ${QUIZ_METADATA.translations.en.title}`);
      console.log(`   - Part ${partNumber}: ${questions.length} questions`);
      console.log(`   - ${questions.length * 4} answers with ${LOCALES.length} translations each`);
    }
  } catch (error) {
    console.error('\nError seeding quiz:', error);
    throw error;
  }
}

seedQuizFromJson()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
