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
});
