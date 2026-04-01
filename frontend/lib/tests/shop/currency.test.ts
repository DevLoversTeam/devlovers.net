import { describe, expect, it } from 'vitest';

import {
  formatMoney,
  formatMoneyCode,
  formatPrice,
  parsePrimaryLocaleFromAcceptLanguage,
  resolveCurrencyFromHeaders,
  resolveCurrencyFromLocale,
} from '../../shop/currency';

const STOREFRONT_LOCALES = ['uk', 'en', 'pl'] as const;

describe('standard storefront locale wrappers', () => {
  it('resolves storefront currency as UAH regardless of locale input', () => {
    expect(resolveCurrencyFromLocale('uk')).toBe('UAH');
    expect(resolveCurrencyFromLocale('uk-UA')).toBe('UAH');
    expect(resolveCurrencyFromLocale('uk_UA')).toBe('UAH');
    expect(resolveCurrencyFromLocale('UK-ua')).toBe('UAH');
    expect(resolveCurrencyFromLocale('en')).toBe('UAH');
    expect(resolveCurrencyFromLocale('pl-PL')).toBe('UAH');
    expect(resolveCurrencyFromLocale(null)).toBe('UAH');
    expect(resolveCurrencyFromLocale(undefined)).toBe('UAH');
    expect(resolveCurrencyFromLocale('')).toBe('UAH');
  });

  it('parses the primary locale from Accept-Language', () => {
    expect(
      parsePrimaryLocaleFromAcceptLanguage('uk-UA,uk;q=0.9,en-US;q=0.8')
    ).toBe('uk-UA');
    expect(parsePrimaryLocaleFromAcceptLanguage('en-US')).toBe('en-US');
    expect(parsePrimaryLocaleFromAcceptLanguage('')).toBe(null);
    expect(parsePrimaryLocaleFromAcceptLanguage(null)).toBe(null);
  });

  it('resolves storefront currency as UAH from Accept-Language headers too', () => {
    const h1 = new Headers({
      'accept-language': 'uk-UA,uk;q=0.9,en-US;q=0.8',
    });
    expect(resolveCurrencyFromHeaders(h1)).toBe('UAH');

    const h2 = new Headers({ 'accept-language': 'en-US,en;q=0.9' });
    expect(resolveCurrencyFromHeaders(h2)).toBe('UAH');

    const h3 = new Headers();
    expect(resolveCurrencyFromHeaders(h3)).toBe('UAH');
  });
});

function normalizeRenderedSpacing(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

describe('UAH storefront formatting', () => {
  it('formats UAH identically across uk / en / pl in Ukrainian storefront style', () => {
    const [canonicalLocale, ...otherLocales] = STOREFRONT_LOCALES;
    const canonical = formatMoney(200000, 'UAH', canonicalLocale);

    for (const locale of otherLocales) {
      expect(formatMoney(200000, 'UAH', locale)).toBe(canonical);
    }

    expect(normalizeRenderedSpacing(canonical)).toBe('2 000,00 ₴');
  });

  it('formats UAH code output identically across uk / en / pl', () => {
    const [canonicalLocale, ...otherLocales] = STOREFRONT_LOCALES;
    const canonical = formatMoneyCode(200000, 'UAH', canonicalLocale);

    for (const locale of otherLocales) {
      expect(formatMoneyCode(200000, 'UAH', locale)).toBe(canonical);
    }

    expect(normalizeRenderedSpacing(canonical)).toBe('2 000,00 UAH');
  });

  it('formats major-unit UAH prices identically across uk / en / pl', () => {
    const [canonicalLocale, ...otherLocales] = STOREFRONT_LOCALES;
    const canonical = formatPrice(2000, {
      currency: 'UAH',
      locale: canonicalLocale,
    });

    for (const locale of otherLocales) {
      expect(
        formatPrice(2000, {
          currency: 'UAH',
          locale,
        })
      ).toBe(canonical);
    }

    expect(normalizeRenderedSpacing(canonical)).toBe('2 000,00 ₴');
  });
});
