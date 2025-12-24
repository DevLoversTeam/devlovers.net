import "server-only";

import type { NextRequest } from "next/server";

import {
  parsePrimaryLocaleFromAcceptLanguage,
  resolveCurrencyFromLocale,
  type CurrencyCode,
} from "@/lib/shop/currency";

/**
 * Canonical locale resolution at API boundaries:
 * 1) next-intl / custom headers (from middleware)
 * 2) locale cookies
 * 3) Accept-Language
 */
export function resolveRequestLocale(request: NextRequest): string | null {
  const headerLocale =
    request.headers.get("x-next-intl-locale") ??
    request.headers.get("x-locale") ??
    null;

  if (headerLocale && headerLocale.trim()) return headerLocale.trim();

  const cookieLocale =
    request.cookies.get("NEXT_LOCALE")?.value ??
    request.cookies.get("locale")?.value ??
    null;

  if (cookieLocale && cookieLocale.trim()) return cookieLocale.trim();

  return parsePrimaryLocaleFromAcceptLanguage(
    request.headers.get("accept-language")
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
