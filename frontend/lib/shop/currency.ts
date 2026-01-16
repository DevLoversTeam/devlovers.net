export const currencyValues = ['USD', 'UAH'] as const;
export type CurrencyCode = (typeof currencyValues)[number];

export const TWO_DECIMAL_CURRENCIES: ReadonlySet<CurrencyCode> = new Set([
  'USD',
  'UAH',
]);

export function isTwoDecimalCurrency(currency: CurrencyCode): boolean {
  return TWO_DECIMAL_CURRENCIES.has(currency);
}

function assertMinorUnitsStrict(minor: number): number {
  if (!Number.isFinite(minor) || !Number.isInteger(minor) || minor < 0) {
    throw new Error('Invalid money minor-units value');
  }
  return minor;
}

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

/**
 * UI locale normalization.
 * Route param locale is usually "uk" | "en", but Intl wants a BCP-47 tag.
 */
function normalizeLocaleForIntl(
  locale: string | null | undefined,
  currency: CurrencyCode
): string {
  const raw = (locale ?? '').trim();
  const primary = normalizeLocaleTag(raw);

  if (primary === 'uk') return 'uk-UA';
  if (primary === 'en') return 'en-US';

  if (raw) return raw.replaceAll('_', '-');

  // Safe fallback (still yields correct narrow symbol for currency)
  return currency === 'UAH' ? 'uk-UA' : 'en-US';
}

const formatterCache = new Map<string, Intl.NumberFormat>();
function getFormatter(locale: string, currency: CurrencyCode) {
  const key = `${locale}::${currency}`;
  const cached = formatterCache.get(key);
  if (cached) return cached;

  const created = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol', // ₴ for UAH when available
  });

  formatterCache.set(key, created);
  return created;
}

function getCurrencyFractionDigits(currency: CurrencyCode): number {
  // Single source of truth: we only support 2-decimal currencies for now.
  if (isTwoDecimalCurrency(currency)) return 2;

  // Future-proof: if CurrencyCode expands (e.g., JPY/BHD), fail closed.
  throw new Error(`Unsupported currency fraction digits: ${currency}`);
}

function minorToMajor(amountMinor: number, currency: CurrencyCode): number {
  const digits = getCurrencyFractionDigits(currency);
  const factor = 10 ** digits;
  return assertMinorUnitsStrict(amountMinor) / factor;
}

/**
 * Canonical UI money formatter.
 * amountMinor is in minor units (cents/kopeks), integer.
 */
export function formatMoney(
  amountMinor: number,
  currency: CurrencyCode,
  locale?: string | null
): string {
  try {
    const minor = assertMinorUnitsStrict(amountMinor);
    const intlLocale = normalizeLocaleForIntl(locale, currency);
    const major = minorToMajor(minor, currency);
    return getFormatter(intlLocale, currency).format(major);
  } catch {
    return '-';
  }
}

/**
 * @deprecated Prefer formatMoney(minor, currency, locale).
 * Legacy formatter for MAJOR units (e.g. 10.50).
 */
export function formatPrice(
  amountMajor: number,
  currencyOrOptions?:
    | CurrencyCode
    | { currency?: CurrencyCode; locale?: string }
) {
  const options =
    typeof currencyOrOptions === 'string'
      ? { currency: currencyOrOptions }
      : currencyOrOptions;

  const currency = options?.currency ?? 'USD';
  const intlLocale = normalizeLocaleForIntl(options?.locale, currency);

  if (!Number.isFinite(amountMajor)) return '-';
  return getFormatter(intlLocale, currency).format(amountMajor);
}
