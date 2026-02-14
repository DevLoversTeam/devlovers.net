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
    paymentsEnabled && (stripeFlag.length > 0 ? stripeFlag === 'true' : true)
  );
}

function resolveMonobankCheckoutEnabled(): boolean {
  const paymentsEnabled = isFlagEnabled(process.env.PAYMENTS_ENABLED);
  if (!paymentsEnabled) return false;

  try {
    return isMonobankEnabled();
  } catch {
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
