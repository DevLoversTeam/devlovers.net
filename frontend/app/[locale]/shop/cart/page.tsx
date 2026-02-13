import type { Metadata } from 'next';

import { isMonobankEnabled } from '@/lib/env/monobank';

import CartPageClient from './CartPageClient';

export const metadata: Metadata = {
  title: 'Cart | DevLovers',
  description: 'Review items in your cart and proceed to checkout.',
};

function isFlagEnabled(value: string | undefined): boolean {
  return (value ?? '').trim() === 'true';
}

function resolveStripeCheckoutEnabled(): boolean {
  const paymentsEnabled = isFlagEnabled(process.env.PAYMENTS_ENABLED);
  const stripeFlag = (process.env.STRIPE_PAYMENTS_ENABLED ?? '').trim();

  return (
    paymentsEnabled &&
    (stripeFlag.length > 0 ? stripeFlag === 'true' : true)
  );
}

function resolveMonobankCheckoutEnabled(): boolean {
  const paymentsEnabled = isFlagEnabled(process.env.PAYMENTS_ENABLED);
  if (!paymentsEnabled) {
    console.warn('[shop][cart] monobank disabled: PAYMENTS_ENABLED is not true');
    return false;
  }

  try {
    const enabled = isMonobankEnabled();
    if (!enabled) {
      console.warn(
        '[shop][cart] monobank disabled: config missing or feature disabled'
      );
    }
    return enabled;
  } catch (err) {
    console.warn(
      '[shop][cart] monobank disabled:',
      err instanceof Error ? err.message : String(err)
    );
    return false;
  }
}

export default function CartPage() {
  return (
    <CartPageClient
      stripeEnabled={resolveStripeCheckoutEnabled()}
      monobankEnabled={resolveMonobankCheckoutEnabled()}
    />
  );
}
