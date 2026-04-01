import type { Metadata } from 'next';

import { getShopLegalVersions } from '@/lib/env/shop-legal';

import {
  resolveMonobankCheckoutEnabled,
  resolveMonobankGooglePayEnabled,
  resolveStripeCheckoutEnabled,
} from './capabilities';
import CartPageClient from './CartPageClient';

export const metadata: Metadata = {
  title: 'Cart | DevLovers',
  description: 'Review items in your cart and proceed to checkout.',
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function CartPage() {
  const legalVersions = getShopLegalVersions();

  return (
    <CartPageClient
      stripeEnabled={resolveStripeCheckoutEnabled()}
      monobankEnabled={resolveMonobankCheckoutEnabled()}
      monobankGooglePayEnabled={resolveMonobankGooglePayEnabled()}
      termsVersion={legalVersions.termsVersion}
      privacyVersion={legalVersions.privacyVersion}
    />
  );
}
