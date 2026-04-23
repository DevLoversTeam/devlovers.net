import { categoryRegistry } from './categoryRegistry';

const createCategory = (slug: string, title: string, displayOrder: number) => ({
  slug,
  displayOrder,
  translations: {
    uk: title,
    en: title,
    pl: title,
  },
});

export const categoryData = categoryRegistry.map(item =>
  createCategory(item.slug, item.title, item.displayOrder)
);
