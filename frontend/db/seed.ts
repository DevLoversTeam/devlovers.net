import 'dotenv/config';

import { db } from './index';
import { categories, questions } from './schema';
import { eq } from 'drizzle-orm';
import data from '../data/questions.json';

async function main() {
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
      answerBlocks: q.answer,
      categoryId: category[0].id,
    });
  }

  console.log('Questions seeded!');
}

main();
