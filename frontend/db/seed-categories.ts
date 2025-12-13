import 'dotenv/config';

import { db } from './index';
import { categories } from './schema';

async function main() {
  const list = ['react', 'vue', 'angular', 'javascript', 'nextjs'];

  for (const name of list) {
    await db.insert(categories).values({ name });
  }

  console.log('Categories seeded!');
}

main();
