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
  return raw.split(/[-_]/)[0] ?? raw;
}

export function resolveCurrencyFromLocale(
  locale: string | null | undefined
): CurrencyCode {
  const primary = normalizeLocaleTag(locale);
  return primary === 'uk' ? 'UAH' : 'USD';
}

export function parsePrimaryLocaleFromAcceptLanguage(
  acceptLanguage: string | null | undefined
): string | null {
  if (!acceptLanguage) return null;

  const first = acceptLanguage.split(',')[0]?.trim();
  if (!first) return null;

  const token = first.split(';')[0]?.trim();
  return token && token.length ? token : null;
}

export function resolveCurrencyFromHeaders(headers: Headers): CurrencyCode {
  const locale = parsePrimaryLocaleFromAcceptLanguage(
    headers.get('accept-language')
  );
  return resolveCurrencyFromLocale(locale);
}

function normalizeLocaleForIntl(
  locale: string | null | undefined,
  currency: CurrencyCode
): string {
  const raw = (locale ?? '').trim();
  const primary = normalizeLocaleTag(raw);

  if (primary === 'uk') return 'uk-UA';
  if (primary === 'en') return 'en-US';

  if (raw) return raw.replaceAll('_', '-');

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
    currencyDisplay: 'narrowSymbol',
  });

  formatterCache.set(key, created);
  return created;
}

function getCurrencyFractionDigits(currency: CurrencyCode): number {
  if (isTwoDecimalCurrency(currency)) return 2;

  throw new Error(`Unsupported currency fraction digits: ${currency}`);
}

function minorToMajor(amountMinor: number, currency: CurrencyCode): number {
  const digits = getCurrencyFractionDigits(currency);
  const factor = 10 ** digits;
  return assertMinorUnitsStrict(amountMinor) / factor;
}

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
