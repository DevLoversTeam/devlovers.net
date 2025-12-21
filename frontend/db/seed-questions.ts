import 'dotenv/config';
import { db } from './index';
import { questions } from './schema';
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

  const rows = data.flatMap(q =>
    Object.entries(q.translations).map(([locale, content]) => ({
      categorySlug: q.category,
      locale,
      sortOrder: q.order ?? 0,
      question: content.question,
      answerBlocks: content.answerBlocks,
    }))
  );

  await db.insert(questions).values(rows).onConflictDoNothing();

  console.log('✅ Questions seeded!');
}

seedQuestions().catch(err => {
  console.error('❌ Seed failed...', err);
  process.exit(1);
});
