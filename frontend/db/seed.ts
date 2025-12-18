import 'dotenv/config';

import { db } from './index';
import { categories, questions } from './schema';
import { eq } from 'drizzle-orm';
// ! Reset sequense to 1
// import { sql } from 'drizzle-orm';

import rawData from '../data/questions.json';

type QuestionSeed = {
  category: string;
  question: string;
  answerBlocks: unknown;
};

const data = (Array.isArray(rawData) ? rawData : []) as QuestionSeed[];

async function main() {
  // ! Reset sequense to 1
  // await db.delete(questions);
  // await db.execute(sql`ALTER SEQUENCE questions_id_seq RESTART WITH 1`);
  // console.log('Table cleared, sequence reset to 1');

  if (!data.length) {
    console.log('No questions to seed — skipping.');
    return;
  }

  for (const q of data) {
    const category = await db
      .select()
      .from(categories)
      .where(eq(categories.name, q.category))
      .limit(1);

    if (!category.length) {
      console.log('Category not found:', q.category);
      continue;
    }

    await db.insert(questions).values({
      question: q.question,
      answerBlocks: q.answerBlocks,
      categoryId: category[0].id,
    });
  }

  console.log('Questions seeded!');
}

main();
