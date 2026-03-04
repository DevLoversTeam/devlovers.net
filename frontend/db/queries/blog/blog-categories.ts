import { sql } from 'drizzle-orm';

import { db } from '../../index';
import {
  blogCategories,
  blogCategoryTranslations,
} from '../../schema/blog';

export interface BlogCategory {
  id: string;
  slug: string;
  title: string;
}

export async function getBlogCategories(
  locale: string
): Promise<BlogCategory[]> {
  const rows = await db
    .select({
      id: blogCategories.id,
      slug: blogCategories.slug,
      title: blogCategoryTranslations.title,
    })
    .from(blogCategories)
    .leftJoin(
      blogCategoryTranslations,
      sql`${blogCategoryTranslations.categoryId} = ${blogCategories.id} AND ${blogCategoryTranslations.locale} = ${locale}`
    )
    .orderBy(blogCategories.displayOrder);

  return rows.map(row => ({
    id: row.id,
    slug: row.slug,
    title: row.title ?? '',
  }));
}
