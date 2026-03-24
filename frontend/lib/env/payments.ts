import { isMonobankEnabled } from '@/lib/env/monobank';
import { ShopProviderConfigError } from '@/lib/env/provider-runtime';
import { isPaymentsEnabled as isStripeEnabled } from '@/lib/env/stripe';
import type { PaymentProvider } from '@/lib/shop/payments';

export function resolveShopPaymentProvider(): PaymentProvider {
  try {
    if (isMonobankEnabled()) return 'monobank';
  } catch (error) {
    if (!(error instanceof ShopProviderConfigError)) {
      throw error;
    }
  }
  if (isStripeEnabled()) return 'stripe';
  return 'none';
}

export function areShopPaymentsEnabled(): boolean {
  return resolveShopPaymentProvider() !== 'none';
}
