import { describe, expect, it } from 'vitest';

import { checkoutPayloadSchema } from '@/lib/validation/shop';

describe('checkout legal consent contract', () => {
  const basePayload = {
    items: [
      {
        productId: '11111111-1111-1111-1111-111111111111',
        quantity: 1,
      },
    ],
  };

  it('requires explicit legal consent in the checkout payload', () => {
    const missingConsent = checkoutPayloadSchema.safeParse(basePayload);
    expect(missingConsent.success).toBe(false);

    const explicitConsent = checkoutPayloadSchema.safeParse({
      ...basePayload,
      legalConsent: {
        termsAccepted: true,
        privacyAccepted: true,
        termsVersion: 'terms-v1',
        privacyVersion: 'privacy-v1',
      },
    });

    expect(explicitConsent.success).toBe(true);
  });

  it('does not infer a provider-derived fallback currency inside the shared checkout schema', () => {
    const stripeWithoutCurrency = checkoutPayloadSchema.safeParse({
      ...basePayload,
      legalConsent: {
        termsAccepted: true,
        privacyAccepted: true,
        termsVersion: 'terms-v1',
        privacyVersion: 'privacy-v1',
      },
      paymentProvider: 'stripe',
      paymentMethod: 'stripe_card',
    });

    expect(stripeWithoutCurrency.success).toBe(true);

    const monobankWithWrongCurrency = checkoutPayloadSchema.safeParse({
      ...basePayload,
      legalConsent: {
        termsAccepted: true,
        privacyAccepted: true,
        termsVersion: 'terms-v1',
        privacyVersion: 'privacy-v1',
      },
      paymentProvider: 'monobank',
      paymentMethod: 'monobank_invoice',
      paymentCurrency: 'USD',
    });

    expect(monobankWithWrongCurrency.success).toBe(false);
  });
});
