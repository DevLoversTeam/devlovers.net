import { describe, expect, it, vi } from 'vitest';

import { getBlogCategoryLabel } from '@/lib/blog/category-label';

describe('blog category labels', () => {
  it('preserves the different Growth aliases in listings and details', () => {
    const translate = (key: string) => key;

    expect(getBlogCategoryLabel('Growth', translate)).toBe('categories.career');
    expect(getBlogCategoryLabel('GROWTH', translate)).toBe('categories.growth');
    expect(getBlogCategoryLabel('GROWTH', translate, 'detail')).toBe(
      'categories.career'
    );
  });

  it('returns unknown names verbatim without a translation lookup', () => {
    const translate = vi.fn();

    for (const name of ['Project Notes', ' Tech ', 'constructor']) {
      expect(getBlogCategoryLabel(name, translate)).toBe(name);
      expect(getBlogCategoryLabel(name, translate, 'detail')).toBe(name);
    }
    expect(translate).not.toHaveBeenCalled();
  });

  it('preserves the listing fallback for an empty translation', () => {
    const translate = () => '';

    expect(getBlogCategoryLabel('Growth', translate)).toBe('Career');
    expect(getBlogCategoryLabel('Growth', translate, 'detail')).toBe('');
  });
});
