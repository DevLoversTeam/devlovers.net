import 'dotenv/config';
import { db } from './index';
import { categories } from './schema';
import { categoryNames } from '../data/category';
import { slugify } from '../utils/slugify';

const LOCALES = ['en', 'pl', 'uk'] as const;

async function seedCategories() {
  const rows = categoryNames.flatMap(name => {
    const slug = slugify(name);

    return LOCALES.map(locale => ({
      slug,
      locale,
      title: name,
    }));
  });

  await db.insert(categories).values(rows).onConflictDoNothing();

  console.log('✅ Categories seeded!');
}

seedCategories().catch(err => {
  console.error('❌ Seed failed...', err);
  process.exit(1);
});
