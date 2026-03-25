import { describe, expect, it } from 'vitest';

import { locales } from '@/i18n/config';
import {
  APPAREL_SIZE_GUIDE_CONTENT,
  getApparelSizeGuide,
} from '@/lib/shop/size-guide';

describe('apparel size guide content source', () => {
  it('covers every storefront locale with practical size-guide content', () => {
    for (const locale of locales) {
      const guide = APPAREL_SIZE_GUIDE_CONTENT[locale];

      expect(guide.label.length).toBeGreaterThan(0);
      expect(guide.title.length).toBeGreaterThan(0);
      expect(guide.intro.length).toBeGreaterThan(0);
      expect(guide.measurementNote.length).toBeGreaterThan(0);
      expect(guide.fitNotes.length).toBeGreaterThanOrEqual(2);
      expect(guide.chart.rows).toHaveLength(6);
      expect(guide.chart.rows.map(row => row.size)).toEqual([
        'XS',
        'S',
        'M',
        'L',
        'XL',
        'XXL',
      ]);
    }
  });

  it('falls back to the default locale for unsupported locale input', () => {
    expect(getApparelSizeGuide('de')).toEqual(APPAREL_SIZE_GUIDE_CONTENT.en);
  });
});
