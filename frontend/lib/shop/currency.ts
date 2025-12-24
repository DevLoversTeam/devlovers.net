export const currencyValues = ['USD', 'UAH'] as const;
export type CurrencyCode = (typeof currencyValues)[number];

function normalizeLocaleTag(locale: string | null | undefined): string {
  const raw = (locale ?? '').trim().toLowerCase();
  if (!raw) return '';
  // "uk-UA" -> "uk", "uk_UA" -> "uk"
  return raw.split(/[-_]/)[0] ?? raw;
}

/**
 * D1 policy:
 * - uk -> UAH
 * - otherwise -> USD
 */
export function resolveCurrencyFromLocale(
  locale: string | null | undefined
): CurrencyCode {
  const primary = normalizeLocaleTag(locale);
  return primary === 'uk' ? 'UAH' : 'USD';
}

/**
 * "uk-UA,uk;q=0.9,en-US;q=0.8" -> "uk-UA"
 */
export function parsePrimaryLocaleFromAcceptLanguage(
  acceptLanguage: string | null | undefined
): string | null {
  if (!acceptLanguage) return null;

  const first = acceptLanguage.split(',')[0]?.trim();
  if (!first) return null;

  const token = first.split(';')[0]?.trim();
  return token && token.length ? token : null;
}

/**
 * Server-only resolution at API boundaries:
 * currency is derived ONLY from locale (Accept-Language).
 */
export function resolveCurrencyFromHeaders(headers: Headers): CurrencyCode {
  const locale = parsePrimaryLocaleFromAcceptLanguage(
    headers.get('accept-language')
  );
  return resolveCurrencyFromLocale(locale);
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function defaultLocaleForCurrency(currency: CurrencyCode): string {
  // дає ₴ для UAH (і нормальний формат для USD)
  return currency === 'UAH' ? 'uk-UA' : 'en-US';
}

function getFormatter(locale: string, currency: CurrencyCode) {
  const key = `${locale}::${currency}`;
  const cached = formatterCache.get(key);
  if (cached) return cached;

  const created = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol', // ключове для ₴
  });

  formatterCache.set(key, created);
  return created;
}

/**
 * UI formatter (safe defaults).
 * amount is in major units (e.g. 10.50)
 */
export function formatPrice(
  amount: number,
  currencyOrOptions?:
    | CurrencyCode
    | { currency?: CurrencyCode; locale?: string }
) {
  const options =
    typeof currencyOrOptions === 'string'
      ? { currency: currencyOrOptions }
      : currencyOrOptions;

  const currency = options?.currency ?? 'USD';
  const locale = options?.locale ?? defaultLocaleForCurrency(currency);

  return getFormatter(locale, currency).format(amount);
}
