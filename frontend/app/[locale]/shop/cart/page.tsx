import type { Metadata } from 'next';

import { isMonobankEnabled } from '@/lib/env/monobank';
import { isPaymentsEnabled as isStripePaymentsEnabled } from '@/lib/env/stripe';

import CartPageClient from './CartPageClient';

export const metadata: Metadata = {
  title: 'Cart | DevLovers',
  description: 'Review items in your cart and proceed to checkout.',
};

function isFlagEnabled(value: string | undefined): boolean {
  return (value ?? '').trim() === 'true';
}

export function resolveStripeCheckoutEnabled(): boolean {
  try {
    return isStripePaymentsEnabled({
      requirePublishableKey: true,
      respectStripePaymentsFlag: true,
    });
  } catch {
    return false;
  }
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

function resolveMonobankGooglePayEnabled(): boolean {
  const raw = (process.env.SHOP_MONOBANK_GPAY_ENABLED ?? '')
    .trim()
    .toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}

export default function CartPage() {
  return (
    <CartPageClient
      stripeEnabled={resolveStripeCheckoutEnabled()}
      monobankEnabled={resolveMonobankCheckoutEnabled()}
      monobankGooglePayEnabled={resolveMonobankGooglePayEnabled()}
    />
  );
}
