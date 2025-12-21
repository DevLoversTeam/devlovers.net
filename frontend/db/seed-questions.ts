import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from './index';
import { categories, questions, questionTranslations } from './schema';
import rawData from '../parse/questions.json';

type RawQuestion = {
  category: string;
  order?: number;
  translations: Record<
    string,
    {
      question: string;
      answerBlocks: unknown;
    }
  >;
};

const data = Array.isArray(rawData) ? (rawData as RawQuestion[]) : [];

async function seedQuestions() {
  if (!data.length) {
    console.log('No questions to seed — skipping.');
    return;
  }

  for (const q of data) {
    // Find category by slug
    const [category] = await db
      .select()
      .from(categories)
      .where(eq(categories.slug, q.category))
      .limit(1);

    if (!category) {
      console.log(`Category ${q.category} not found, skipping question...`);
      continue;
    }

    // Insert question
    const [question] = await db
      .insert(questions)
      .values({
        categoryId: category.id,
        sortOrder: q.order ?? 0,
      })
      .returning();

    // Insert translations
    const translations = Object.entries(q.translations).map(
      ([locale, content]) => ({
        questionId: question.id,
        locale,
        question: content.question,
        answerBlocks: content.answerBlocks,
      })
    );

    await db.insert(questionTranslations).values(translations);
  }

  console.log('Questions seeded!');
}

seedQuestions().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});