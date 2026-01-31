import type { Metadata } from 'next';
import CartPageClient from './CartPageClient';

export const metadata: Metadata = {
  title: 'Cart | DevLovers',
  description: 'Review items in your cart and proceed to checkout.',
};

export default function CartPage() {
  return <CartPageClient />;
}
