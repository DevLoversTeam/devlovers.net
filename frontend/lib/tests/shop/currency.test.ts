import { describe, expect, it } from 'vitest';

import {
  parsePrimaryLocaleFromAcceptLanguage,
  resolveCurrencyFromHeaders,
  resolveCurrencyFromLocale,
} from '../../shop/currency';

describe('currency policy (CUR-0 / D1)', () => {
  it('uk -> UAH', () => {
    expect(resolveCurrencyFromLocale('uk')).toBe('UAH');
    expect(resolveCurrencyFromLocale('uk-UA')).toBe('UAH');
    expect(resolveCurrencyFromLocale('uk_UA')).toBe('UAH');
    expect(resolveCurrencyFromLocale('UK-ua')).toBe('UAH');
  });

  it('non-uk -> USD', () => {
    expect(resolveCurrencyFromLocale('en')).toBe('USD');
    expect(resolveCurrencyFromLocale('pl-PL')).toBe('USD');
    expect(resolveCurrencyFromLocale(null)).toBe('USD');
    expect(resolveCurrencyFromLocale(undefined)).toBe('USD');
    expect(resolveCurrencyFromLocale('')).toBe('USD');
  });

  it('parses primary locale from Accept-Language', () => {
    expect(
      parsePrimaryLocaleFromAcceptLanguage('uk-UA,uk;q=0.9,en-US;q=0.8')
    ).toBe('uk-UA');
    expect(parsePrimaryLocaleFromAcceptLanguage('en-US')).toBe('en-US');
    expect(parsePrimaryLocaleFromAcceptLanguage('')).toBe(null);
    expect(parsePrimaryLocaleFromAcceptLanguage(null)).toBe(null);
  });

  it('resolves from headers only (Accept-Language)', () => {
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
