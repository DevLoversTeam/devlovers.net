export const locales = ['uk', 'en', 'pl'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'uk';

export const localeNames: Record<Locale, string> = {
  uk: 'Українська',
  en: 'English',
  pl: 'Polski',
};
