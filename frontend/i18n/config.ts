export const locales = ['en', 'uk', 'pl'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export const localeNames: Record<Locale, string> = {
  uk: 'Українська',
  en: 'English',
  pl: 'Polski',
};
