import { describe, expect, it } from 'vitest';

import {
  inferCurrentCheckoutProviderFromMethod,
  resolveCurrentCheckoutProviderCandidates,
  resolveCurrentStandardStorefrontCurrencyFromLocale,
  resolveCurrentStandardStorefrontShippingCountryFromLocale,
  resolveStandardStorefrontCheckoutProviderCandidates,
  STANDARD_STOREFRONT_COMMERCIAL_POLICY,
} from '@/lib/shop/commercial-policy';

describe('commercial policy contract', () => {
  it('encodes the Batch CP-01 standard storefront target policy in one place', () => {
    expect(STANDARD_STOREFRONT_COMMERCIAL_POLICY).toEqual({
      localePolicy: 'content_only',
      currency: 'UAH',
      shippingCountry: 'UA',
      providerEnablement: 'env_runtime_capability',
      intlFlow: 'untouched',
      dormantUsd: 'compatibility_only',
      schemaCleanup: 'deferred',
    });
  });

  it('returns the standard storefront currency regardless of locale wrapper input', () => {
    expect(resolveCurrentStandardStorefrontCurrencyFromLocale('uk')).toBe(
      'UAH'
    );
    expect(resolveCurrentStandardStorefrontCurrencyFromLocale('uk-UA')).toBe(
      'UAH'
    );
    expect(resolveCurrentStandardStorefrontCurrencyFromLocale('en')).toBe(
      'UAH'
    );
    expect(resolveCurrentStandardStorefrontCurrencyFromLocale('pl-PL')).toBe(
      'UAH'
    );
    expect(resolveCurrentStandardStorefrontCurrencyFromLocale(null)).toBe(
      'UAH'
    );
  });

  it('returns the standard storefront shipping country regardless of locale wrapper input', () => {
    expect(
      resolveCurrentStandardStorefrontShippingCountryFromLocale('uk')
    ).toBe('UA');
    expect(
      resolveCurrentStandardStorefrontShippingCountryFromLocale('uk-UA')
    ).toBe('UA');
    expect(
      resolveCurrentStandardStorefrontShippingCountryFromLocale('en')
    ).toBe('UA');
    expect(
      resolveCurrentStandardStorefrontShippingCountryFromLocale(null)
    ).toBe('UA');
  });

  it('tightens the currency-aware checkout provider helper against contradictory provider and method input', () => {
    expect(inferCurrentCheckoutProviderFromMethod('stripe_card')).toBe(
      'stripe'
    );
    expect(inferCurrentCheckoutProviderFromMethod('monobank_invoice')).toBe(
      'monobank'
    );
    expect(
      resolveCurrentCheckoutProviderCandidates({
        currency: 'UAH',
      })
    ).toEqual(['monobank', 'stripe']);
    expect(
      resolveCurrentCheckoutProviderCandidates({
        currency: 'USD',
      })
    ).toEqual(['stripe']);
    expect(
      resolveCurrentCheckoutProviderCandidates({
        requestedMethod: 'stripe_card',
        currency: 'UAH',
      })
    ).toEqual(['stripe']);
    expect(
      resolveCurrentCheckoutProviderCandidates({
        requestedProvider: 'monobank',
        currency: 'USD',
      })
    ).toEqual([]);
    expect(
      resolveCurrentCheckoutProviderCandidates({
        requestedMethod: 'monobank_invoice',
        currency: 'USD',
      })
    ).toEqual([]);
    expect(
      resolveCurrentCheckoutProviderCandidates({
        requestedProvider: 'stripe',
        requestedMethod: 'stripe_card',
        currency: 'USD',
      })
    ).toEqual(['stripe']);
  });

  it('tightens the standard storefront checkout provider helper against contradictory provider and method input', () => {
    expect(resolveStandardStorefrontCheckoutProviderCandidates({})).toEqual([
      'monobank',
      'stripe',
    ]);
    expect(
      resolveStandardStorefrontCheckoutProviderCandidates({
        requestedProvider: 'stripe',
      })
    ).toEqual(['stripe']);
    expect(
      resolveStandardStorefrontCheckoutProviderCandidates({
        requestedMethod: 'monobank_invoice',
      })
    ).toEqual(['monobank']);
    expect(
      resolveStandardStorefrontCheckoutProviderCandidates({
        requestedProvider: 'stripe',
        requestedMethod: 'monobank_invoice',
      })
    ).toEqual([]);
  });
});
