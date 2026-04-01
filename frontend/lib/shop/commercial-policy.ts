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

export function resolveStandardStorefrontCurrency(): StandardStorefrontCurrency {
  return STANDARD_STOREFRONT_COMMERCIAL_POLICY.currency;
}

export function resolveStandardStorefrontShippingCountry(): StandardStorefrontShippingCountry {
  return STANDARD_STOREFRONT_COMMERCIAL_POLICY.shippingCountry;
}

export function resolveStandardStorefrontCheckoutProviderCandidates(args: {
  requestedProvider?: CompatibleCheckoutProvider | null;
  requestedMethod?: CompatiblePaymentMethod | null;
}): readonly CompatibleCheckoutProvider[] {
  return resolveCheckoutProviderCandidatesFromAllowedProviders({
    allowedProviders: ['monobank', 'stripe'],
    requestedProvider: args.requestedProvider,
    requestedMethod: args.requestedMethod,
  });
}

export function resolveCurrentStandardStorefrontCurrencyFromLocale(
  locale: string | null | undefined
): CompatibleCurrency {
  void locale;
  return STANDARD_STOREFRONT_COMMERCIAL_POLICY.currency;
}

export function resolveCurrentStandardStorefrontShippingCountryFromLocale(
  locale: string | null | undefined
): StandardStorefrontShippingCountry | null {
  void locale;
  return STANDARD_STOREFRONT_COMMERCIAL_POLICY.shippingCountry;
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
  const allowedProviders: readonly CompatibleCheckoutProvider[] =
    args.currency === STANDARD_STOREFRONT_COMMERCIAL_POLICY.currency
      ? ['monobank', 'stripe']
      : ['stripe'];

  return resolveCheckoutProviderCandidatesFromAllowedProviders({
    allowedProviders,
    requestedProvider: args.requestedProvider,
    requestedMethod: args.requestedMethod,
  });
}

function resolveCheckoutProviderCandidatesFromAllowedProviders(args: {
  allowedProviders: readonly CompatibleCheckoutProvider[];
  requestedProvider?: CompatibleCheckoutProvider | null;
  requestedMethod?: CompatiblePaymentMethod | null;
}): readonly CompatibleCheckoutProvider[] {
  const inferredProvider = inferCurrentCheckoutProviderFromMethod(
    args.requestedMethod
  );
  const methodFiltered = inferredProvider
    ? args.allowedProviders.filter(provider => provider === inferredProvider)
    : [...args.allowedProviders];

  if (!args.requestedProvider) {
    return methodFiltered;
  }

  return methodFiltered.filter(provider => provider === args.requestedProvider);
}
