import { describe, expect, it } from 'vitest';

import {
  formatMoney,
  formatMoneyCode,
  formatPrice,
  parsePrimaryLocaleFromAcceptLanguage,
  resolveCurrencyFromHeaders,
  resolveCurrencyFromLocale,
} from '../../shop/currency';

describe('legacy locale currency compatibility helper', () => {
  it('maps uk locales to UAH for compatibility resolution', () => {
    expect(resolveCurrencyFromLocale('uk')).toBe('UAH');
    expect(resolveCurrencyFromLocale('uk-UA')).toBe('UAH');
    expect(resolveCurrencyFromLocale('uk_UA')).toBe('UAH');
    expect(resolveCurrencyFromLocale('UK-ua')).toBe('UAH');
  });

  it('maps non-uk locales to USD for compatibility resolution', () => {
    expect(resolveCurrencyFromLocale('en')).toBe('USD');
    expect(resolveCurrencyFromLocale('pl-PL')).toBe('USD');
    expect(resolveCurrencyFromLocale(null)).toBe('USD');
    expect(resolveCurrencyFromLocale(undefined)).toBe('USD');
    expect(resolveCurrencyFromLocale('')).toBe('USD');
  });

  it('parses the primary locale from Accept-Language for compatibility helpers', () => {
    expect(
      parsePrimaryLocaleFromAcceptLanguage('uk-UA,uk;q=0.9,en-US;q=0.8')
    ).toBe('uk-UA');
    expect(parsePrimaryLocaleFromAcceptLanguage('en-US')).toBe('en-US');
    expect(parsePrimaryLocaleFromAcceptLanguage('')).toBe(null);
    expect(parsePrimaryLocaleFromAcceptLanguage(null)).toBe(null);
  });

  it('resolves locale-derived compatibility currency from Accept-Language headers', () => {
    const h1 = new Headers({
      'accept-language': 'uk-UA,uk;q=0.9,en-US;q=0.8',
    });
    expect(resolveCurrencyFromHeaders(h1)).toBe('UAH');

    const h2 = new Headers({ 'accept-language': 'en-US,en;q=0.9' });
    expect(resolveCurrencyFromHeaders(h2)).toBe('USD');

    const h3 = new Headers();
    expect(resolveCurrencyFromHeaders(h3)).toBe('USD');
  });
});

function normalizeRenderedSpacing(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

describe('UAH storefront formatting', () => {
  it('formats UAH identically across uk / en / pl in Ukrainian storefront style', () => {
    const uk = formatMoney(200000, 'UAH', 'uk');
    const en = formatMoney(200000, 'UAH', 'en');
    const pl = formatMoney(200000, 'UAH', 'pl');

    expect(en).toBe(uk);
    expect(pl).toBe(uk);
    expect(normalizeRenderedSpacing(uk)).toBe('2 000,00 ₴');
  });

  it('formats UAH code output identically across uk / en / pl', () => {
    const uk = formatMoneyCode(200000, 'UAH', 'uk');
    const en = formatMoneyCode(200000, 'UAH', 'en');
    const pl = formatMoneyCode(200000, 'UAH', 'pl');

    expect(en).toBe(uk);
    expect(pl).toBe(uk);
    expect(normalizeRenderedSpacing(uk)).toBe('2 000,00 UAH');
  });

  it('formats major-unit UAH prices identically across uk / en / pl', () => {
    const uk = formatPrice(2000, { currency: 'UAH', locale: 'uk' });
    const en = formatPrice(2000, { currency: 'UAH', locale: 'en' });
    const pl = formatPrice(2000, { currency: 'UAH', locale: 'pl' });

    expect(en).toBe(uk);
    expect(pl).toBe(uk);
    expect(normalizeRenderedSpacing(uk)).toBe('2 000,00 ₴');
  });
});
