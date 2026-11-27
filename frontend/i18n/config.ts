export const locales = ['en', 'uk', 'pl'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export const ukrainianFirstLocales: readonly Locale[] = [
  'uk',
  ...locales.filter(locale => locale !== 'uk'),
];

export function isSupportedLocale(value: unknown): value is Locale {
  return locales.some(locale => locale === value);
}

export const localeNames: Record<Locale, string> = {
  uk: 'Українська',
  en: 'English',
  pl: 'Polski',
};
