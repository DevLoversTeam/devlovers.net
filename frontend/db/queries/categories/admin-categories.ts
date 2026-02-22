import { eq, max, sql } from 'drizzle-orm';

import { db } from '../../index';
import { categories, categoryTranslations } from '../../schema/categories';
import { quizzes } from '../../schema/quiz';

const ADMIN_LOCALE = 'en';

export interface AdminCategoryItem {
  id: string;
  slug: string;
  title: string;
}

export async function getAdminCategoryList(): Promise<AdminCategoryItem[]> {
  const rows = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      title: categoryTranslations.title,
    })
    .from(categories)
    .innerJoin(
      categoryTranslations,
      sql`${categoryTranslations.categoryId} = ${categories.id} AND ${categoryTranslations.locale} = ${ADMIN_LOCALE}`
    )
    .orderBy(categories.displayOrder);

  return rows;
}

export async function getMaxQuizDisplayOrder(
  categoryId: string
): Promise<number> {
  const [row] = await db
    .select({ maxOrder: max(quizzes.displayOrder) })
    .from(quizzes)
    .where(eq(quizzes.categoryId, categoryId));

  return row?.maxOrder ?? 0;
}
