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

  it('keeps current locale-based storefront currency compatibility unchanged', () => {
    expect(resolveCurrentStandardStorefrontCurrencyFromLocale('uk')).toBe(
      'UAH'
    );
    expect(resolveCurrentStandardStorefrontCurrencyFromLocale('uk-UA')).toBe(
      'UAH'
    );
    expect(resolveCurrentStandardStorefrontCurrencyFromLocale('en')).toBe(
      'USD'
    );
    expect(resolveCurrentStandardStorefrontCurrencyFromLocale('pl-PL')).toBe(
      'USD'
    );
    expect(resolveCurrentStandardStorefrontCurrencyFromLocale(null)).toBe(
      'USD'
    );
  });

  it('keeps current locale-based shipping country compatibility unchanged', () => {
    expect(
      resolveCurrentStandardStorefrontShippingCountryFromLocale('uk')
    ).toBe('UA');
    expect(
      resolveCurrentStandardStorefrontShippingCountryFromLocale('uk-UA')
    ).toBe('UA');
    expect(
      resolveCurrentStandardStorefrontShippingCountryFromLocale('en')
    ).toBe(null);
    expect(
      resolveCurrentStandardStorefrontShippingCountryFromLocale(null)
    ).toBe(null);
  });

  it('keeps current checkout provider candidate compatibility unchanged', () => {
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
  });

  it('resolves standard storefront checkout provider candidates without locale-derived currency input', () => {
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
  });
});
