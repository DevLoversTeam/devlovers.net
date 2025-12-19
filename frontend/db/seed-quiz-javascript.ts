// db/seeds/seed-quiz-javascript.ts
// Loads JavaScript quiz data from JSON files and inserts into database
// Run: npx tsx db/seeds/seed-quiz-javascript.ts <part-number>
// Example: npx tsx db/seeds/seed-quiz-javascript.ts 1
// Or upload all: npx tsx db/seeds/seed-quiz-javascript.ts all

import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { db } from './index';
import {
  quizzes,
  quizTranslations,
  quizQuestions,
  quizQuestionContent,
  quizAnswers,
  quizAnswerTranslations,
} from './schema/quiz';

type Locale = 'uk' | 'en' | 'pl';
const LOCALES: Locale[] = ['uk', 'en', 'pl'];

interface QuestionData {
  id: string;
  order: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
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

// Quiz metadata (same for all parts)
const QUIZ_METADATA = {
  quizId: 'quiz-javascript-fundamentals',
  topicId: 'topic-javascript',
  slug: 'javascript-fundamentals',
  questionsCount: 40,
  timeLimitSeconds: 1800,
  translations: {
    uk: {
      title: 'Основи JavaScript',
      description: 'Перевірте свої знання базових концепцій JavaScript: змінні, типи даних, функції, асинхронність, прототипи та ES6+ можливості.',
    },
    en: {
      title: 'JavaScript Fundamentals',
      description: 'Test your knowledge of JavaScript basics: variables, data types, functions, asynchronicity, prototypes and ES6+ features.',
    },
    pl: {
      title: 'Podstawy JavaScript',
      description: 'Sprawdź swoją wiedzę o podstawach JavaScript: zmienne, typy danych, funkcje, asynchroniczność, prototypy i funkcje ES6+.',
    },
  },
};

// Simple explanation block (text only for compact JSON)
function createExplanation(text: string) {
  return [{ type: 'paragraph' as const, children: [{ text }] }];
}

async function loadQuestions(partNumber: number): Promise<QuestionData[]> {
  const partPath = join(process.cwd(), 'data', `javascript-quiz-part${partNumber}.json`);
  const partData: QuizPartData = JSON.parse(readFileSync(partPath, 'utf-8'));
  return partData.questions;
}

async function ensureQuizExists(): Promise<string> {
  console.log('Ensuring quiz exists...');
  
  // Clean up old quiz by slug
  const existing = await db.query.quizzes.findFirst({
    where: eq(quizzes.slug, QUIZ_METADATA.slug),
  });
  if (existing) {
    await db.delete(quizzes).where(eq(quizzes.id, existing.id));
    console.log('Old quiz deleted');
  }

  // Insert quiz - DB generates id
  const [quiz] = await db.insert(quizzes).values({
    topicId: randomUUID(),
    slug: QUIZ_METADATA.slug,
    displayOrder: 1,
    questionsCount: QUIZ_METADATA.questionsCount,
    timeLimitSeconds: QUIZ_METADATA.timeLimitSeconds,
    isActive: true,
  }).returning();

  // Insert translations
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
    // DB generates question id
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
      
      // DB generates answer id
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
    console.error('❌ Error: Please specify which part to upload');
    console.log('Usage: npx tsx db/seeds/seed-quiz-javascript.ts <part-number>');
    console.log('Example: npx tsx db/seeds/seed-quiz-javascript.ts 1');
    console.log('Or upload all: npx tsx db/seeds/seed-quiz-javascript.ts all');
    process.exit(1);
  }

  console.log('🚀 Starting JavaScript quiz seed...\n');

  try {
    const quizId = await ensureQuizExists();

    if (partArg.toLowerCase() === 'all') {
      // Upload all parts
      console.log('📦 Uploading all parts...\n');
      let totalQuestions = 0;

      for (let i = 1; i <= 4; i++) {
        const questions = await loadQuestions(i);
        await seedQuestions(questions, quizId, i);
        totalQuestions += questions.length;
      }

      console.log('\n✅ All parts seeded successfully!');
      console.log(`   - 1 quiz with ${LOCALES.length} translations`);
      console.log(`   - ${totalQuestions} questions total`);
      console.log(`   - ${totalQuestions * 4} answers with ${LOCALES.length} translations each`);
    } else {
      // Upload specific part
      const partNumber = parseInt(partArg, 10);

      if (isNaN(partNumber) || partNumber < 1 || partNumber > 4) {
        console.error('❌ Error: Part number must be between 1 and 4');
        process.exit(1);
      }

      const questions = await loadQuestions(partNumber);
      await seedQuestions(questions, quizId, partNumber);

      console.log('\n✅ Part seeded successfully!');
      console.log(`   - Quiz: ${QUIZ_METADATA.translations.en.title}`);
      console.log(`   - Part ${partNumber}: ${questions.length} questions`);
      console.log(`   - ${questions.length * 4} answers with ${LOCALES.length} translations each`);
    }
  } catch (error) {
    console.error('\n❌ Error seeding quiz:', error);
    throw error;
  }
}

seedQuizFromJson()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
