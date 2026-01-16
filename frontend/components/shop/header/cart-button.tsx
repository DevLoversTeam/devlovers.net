'use client';

import { ShoppingBag } from 'lucide-react';

import { Link } from '@/i18n/routing';
import { useMounted } from '@/hooks/use-mounted';

import { useCart } from '../cart-provider';

export function CartButton() {
  const { cart } = useCart();
  const mounted = useMounted();

  const itemCount = mounted ? cart.summary.itemCount : 0;
  const showCount = itemCount > 0;

  return (
    <Link
      href="/shop/cart"
      className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      aria-label={showCount ? `Cart, ${itemCount} items` : 'Cart'}
    >
      <ShoppingBag className="h-5 w-5" aria-hidden="true" />
      {showCount ? (
        <span
          className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-xs font-medium text-accent-foreground"
          aria-label={`${itemCount} items in cart`}
        >
          {itemCount}
        </span>
      ) : null}
    </Link>
  );
}
