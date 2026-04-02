type CheckoutProvider = 'stripe' | 'monobank';
type CheckoutPaymentMethod =
  | 'stripe_card'
  | 'monobank_invoice'
  | 'monobank_google_pay';

export function resolveInitialProvider(args: {
  stripeEnabled: boolean;
  monobankEnabled: boolean;
  currency: string | null | undefined;
}): CheckoutProvider {
  void args.currency;

  const canUseStripe = args.stripeEnabled;
  const canUseMonobank = args.monobankEnabled;

  if (canUseMonobank) return 'monobank';
  if (canUseStripe) return 'stripe';
  return 'stripe';
}

export function resolveDefaultMethodForProvider(args: {
  provider: CheckoutProvider;
  currency: string | null | undefined;
}): CheckoutPaymentMethod | null {
  void args.currency;

  if (args.provider === 'stripe') return 'stripe_card';
  if (args.provider === 'monobank') {
    return 'monobank_invoice';
  }
  return null;
}
