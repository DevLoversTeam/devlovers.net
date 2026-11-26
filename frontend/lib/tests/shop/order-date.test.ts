import { describe, expect, it } from 'vitest';

import { locales } from '@/i18n/config';
import { createOrderDateFormatter } from '@/lib/shop/order-date';

const iso = '2026-03-04T12:34:00.000Z';
const date = new Date(iso);

describe('order date formatting', () => {
  it.each(locales)('preserves the date and time format for %s', locale => {
    const format = createOrderDateFormatter(locale);
    const expected = new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);

    expect(format(date)).toBe(expected);
    expect(format(iso)).toBe(expected);
  });

  it.each(locales)(
    'preserves the admin list date-only format for %s',
    locale => {
      const format = createOrderDateFormatter(locale, 'date');
      const expected = new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(date);

      expect(format(date)).toBe(expected);
    }
  );

  it('handles missing and invalid timestamps', () => {
    const format = createOrderDateFormatter('en');

    expect(format(null)).toBe('-');
    expect(format(undefined)).toBe('-');
    expect(format('')).toBe('-');
    expect(format(new Date(NaN))).toBe('-');
    expect(format('invalid timestamp')).toBe('invalid timestamp');
  });

  it('falls back to an ISO timestamp for a malformed locale', () => {
    expect(createOrderDateFormatter('en_US')(date)).toBe(iso);
  });
});
