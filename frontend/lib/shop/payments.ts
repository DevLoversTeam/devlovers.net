export const paymentStatusValues = [
  'pending',
  'requires_payment',
  'paid',
  'failed',
  'refunded',
] as const;

export type PaymentStatus = (typeof paymentStatusValues)[number];

export const paymentProviderValues = ['stripe', 'none'] as const;

export type PaymentProvider = (typeof paymentProviderValues)[number];
