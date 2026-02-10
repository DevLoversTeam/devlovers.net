import { isMonobankEnabled } from '@/lib/env/monobank';
import { isPaymentsEnabled as isStripeEnabled } from '@/lib/env/stripe';
import type { PaymentProvider } from '@/lib/shop/payments';

export function resolveShopPaymentProvider(): PaymentProvider {
  if (isMonobankEnabled()) return 'monobank';
  if (isStripeEnabled()) return 'stripe';
  return 'none';
}

export function areShopPaymentsEnabled(): boolean {
  return resolveShopPaymentProvider() !== 'none';
}
