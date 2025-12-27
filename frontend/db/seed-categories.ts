import 'dotenv/config';
import { db } from './index';
import { categories, categoryTranslations } from './schema';
import { categoryData } from '../data/category';

const LOCALES = ['uk', 'en', 'pl'] as const;

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

    const translations = LOCALES.map(locale => ({
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
