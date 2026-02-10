export const paymentStatusValues = [
  'pending',
  'requires_payment',
  'paid',
  'failed',
  'refunded',
  'needs_review',
] as const;

export type PaymentStatus = (typeof paymentStatusValues)[number];

export const paymentProviderValues = ['stripe', 'monobank', 'none'] as const;

export type PaymentProvider = (typeof paymentProviderValues)[number];
