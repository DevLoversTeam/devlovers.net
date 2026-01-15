const createCategory = (slug: string, title: string, displayOrder: number) => ({
  slug,
  displayOrder,
  translations: {
    uk: title,
    en: title,
    pl: title,
  },
});

export const categoryData = [
  createCategory('git', 'Git', 0),
  createCategory('html', 'HTML', 1),
  createCategory('css', 'CSS', 2),
  createCategory('javascript', 'JavaScript', 3),
  createCategory('typescript', 'TypeScript', 4),
  createCategory('react', 'React', 5),
  createCategory('next', 'Next.js', 6),
  createCategory('vue', 'Vue.js', 7),
  createCategory('angular', 'Angular', 8),
  createCategory('node', 'Node.js', 9),
];
