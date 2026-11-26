import 'dotenv/config';

import { categoryData } from '../data/category';
import { ukrainianFirstLocales } from '../i18n/config';
import { db } from './index';
import { categories, categoryTranslations } from './schema';

async function seedCategories() {
  for (const item of categoryData) {
    const [category] = await db
      .insert(categories)
      .values({
        slug: item.slug,
        displayOrder: item.displayOrder,
      })
      .onConflictDoNothing()
      .returning();

    if (!category) {
      console.log(`Category ${item.slug} already exists, skipping...`);
      continue;
    }

    const translations = ukrainianFirstLocales.map(locale => ({
      categoryId: category.id,
      locale,
      title: item.translations[locale],
    }));

    await db
      .insert(categoryTranslations)
      .values(translations)
      .onConflictDoNothing();
    console.log(`Seeded: ${item.slug}`);
  }

  console.log('Categories seeded!');
}

seedCategories().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
