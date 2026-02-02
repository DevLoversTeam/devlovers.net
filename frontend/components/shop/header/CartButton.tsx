'use client';

import { ShoppingBag } from 'lucide-react';

import { useMounted } from '@/hooks/use-mounted';
import { HeaderButton } from '@/components/shared/HeaderButton';

import { useCart } from '../CartProvider';

export function CartButton() {
  const { cart } = useCart();
  const mounted = useMounted();

  const itemCount = mounted ? cart.summary.itemCount : 0;
  const showCount = itemCount > 0;

  const badgeText = itemCount > 99 ? '99+' : itemCount;

  return (
    <HeaderButton
      href="/shop/cart"
      variant="icon"
      icon={ShoppingBag}
      label={showCount ? `Cart, ${itemCount} items` : 'Cart'}
      badge={showCount ? badgeText : undefined}
      badgeClassName="bg-[color:var(--accent-primary)] text-white"
    />
  );
}
