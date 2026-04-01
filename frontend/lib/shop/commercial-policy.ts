export type StandardStorefrontCurrency = 'UAH';
export type StandardStorefrontShippingCountry = 'UA';
export type CompatibleCurrency = 'USD' | StandardStorefrontCurrency;
export type CompatibleCheckoutProvider = 'stripe' | 'monobank';
export type CompatiblePaymentMethod =
  | 'stripe_card'
  | 'monobank_invoice'
  | 'monobank_google_pay';

export const STANDARD_STOREFRONT_COMMERCIAL_POLICY = {
  localePolicy: 'content_only',
  currency: 'UAH',
  shippingCountry: 'UA',
  providerEnablement: 'env_runtime_capability',
  intlFlow: 'untouched',
  dormantUsd: 'compatibility_only',
  schemaCleanup: 'deferred',
} as const;

function normalizeLocaleTag(locale: string | null | undefined): string {
  const raw = (locale ?? '').trim().toLowerCase();
  if (!raw) return '';
  return raw.split(/[-_]/)[0] ?? raw;
}

export function resolveCurrentStandardStorefrontCurrencyFromLocale(
  locale: string | null | undefined
): CompatibleCurrency {
  const primary = normalizeLocaleTag(locale);
  return primary === 'uk'
    ? STANDARD_STOREFRONT_COMMERCIAL_POLICY.currency
    : 'USD';
}

export function resolveCurrentStandardStorefrontShippingCountryFromLocale(
  locale: string | null | undefined
): StandardStorefrontShippingCountry | null {
  const primary = normalizeLocaleTag(locale);
  return primary === 'uk'
    ? STANDARD_STOREFRONT_COMMERCIAL_POLICY.shippingCountry
    : null;
}

export function inferCurrentCheckoutProviderFromMethod(
  method: CompatiblePaymentMethod | null | undefined
): CompatibleCheckoutProvider | null {
  if (method === 'stripe_card') return 'stripe';
  if (method === 'monobank_invoice' || method === 'monobank_google_pay') {
    return 'monobank';
  }

  return null;
}

export function resolveCurrentCheckoutProviderCandidates(args: {
  requestedProvider?: CompatibleCheckoutProvider | null;
  requestedMethod?: CompatiblePaymentMethod | null;
  currency: CompatibleCurrency;
}): readonly CompatibleCheckoutProvider[] {
  const explicitProvider =
    args.requestedProvider ??
    inferCurrentCheckoutProviderFromMethod(args.requestedMethod);

  if (explicitProvider) {
    return [explicitProvider];
  }

  if (args.currency === STANDARD_STOREFRONT_COMMERCIAL_POLICY.currency) {
    return ['monobank', 'stripe'];
  }

  return ['stripe'];
}
