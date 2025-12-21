import 'dotenv/config';
import { db } from './index';
import { categories, categoryTranslations } from './schema';
import { categoryNames } from '../data/category';

const LOCALES = ['uk', 'en', 'pl'] as const;

async function seedCategories() {
  for (let i = 0; i < categoryNames.length; i++) {
    const name = categoryNames[i];
    const slug = name.toLowerCase();

    // Insert category
    const [category] = await db
      .insert(categories)
      .values({
        slug,
        displayOrder: i,
      })
      .onConflictDoNothing()
      .returning();

    if (!category) {
      console.log(`Category ${slug} already exists, skipping...`);
      continue;
    }

    // Insert translations
    const translations = LOCALES.map(locale => ({
      categoryId: category.id,
      locale,
      title: name,
    }));

    await db.insert(categoryTranslations).values(translations).onConflictDoNothing();
  }

  console.log('Categories seeded!');
}

seedCategories().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
