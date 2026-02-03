'use client';

import { ShoppingBag } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { HeaderButton } from '@/components/shared/HeaderButton';
import { useMounted } from '@/hooks/use-mounted';

import { useCart } from '../CartProvider';

export function CartButton() {
  const { cart } = useCart();
  const mounted = useMounted();
  const t = useTranslations('aria');

  const itemCount = mounted ? cart.summary.itemCount : 0;
  const showCount = itemCount > 0;

  const badgeText = itemCount > 99 ? '99+' : itemCount;
  const label = showCount
    ? t('cartWithItems', { count: itemCount })
    : t('cart');

  return (
    <HeaderButton
      href="/shop/cart"
      variant="icon"
      icon={ShoppingBag}
      label={label}
      badge={showCount ? badgeText : undefined}
      badgeClassName="bg-[color:var(--accent-primary)] text-white"
    />
  );
}
