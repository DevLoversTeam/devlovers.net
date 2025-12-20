import 'dotenv/config';

import { db } from './index';
import { categories } from './schema';
import { categoryNames } from '../data/categories';

async function categoriesList() {
  for (const name of categoryNames) {
    await db.insert(categories).values({ name });
  }

  console.log('Categories seeded!');
}

categoriesList();
