import 'server-only';

import type { NextRequest } from 'next/server';

import {
  type CurrencyCode,
  parsePrimaryLocaleFromAcceptLanguage,
  resolveCurrencyFromLocale,
} from '@/lib/shop/currency';

export function resolveRequestLocale(request: NextRequest): string | null {
  const headerLocale =
    request.headers.get('x-next-intl-locale') ??
    request.headers.get('x-locale') ??
    null;

  if (headerLocale && headerLocale.trim()) return headerLocale.trim();

  const cookieLocale =
    request.cookies.get('NEXT_LOCALE')?.value ??
    request.cookies.get('locale')?.value ??
    null;

  if (cookieLocale && cookieLocale.trim()) return cookieLocale.trim();

  return parsePrimaryLocaleFromAcceptLanguage(
    request.headers.get('accept-language')
  );
}

export function resolveLocaleAndCurrency(request: NextRequest): {
  locale: string | null;
  currency: CurrencyCode;
} {
  const locale = resolveRequestLocale(request);
  const currency = resolveCurrencyFromLocale(locale);
  return { locale, currency };
}
