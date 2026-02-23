'use client';

import { ShoppingBag } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/routing';
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
    <Link
      href="/shop/cart"
      aria-label={label}
      title={label}
      className="text-muted-foreground hover:bg-secondary active:bg-secondary hover:text-(--accent-primary) relative flex h-9 w-9 items-center justify-center rounded-full border border-transparent transition-colors hover:border-gray-200 dark:hover:border-neutral-800"
    >
      <ShoppingBag className="h-4 w-4" />
      {showCount && (
        <span className="pointer-events-none absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-background bg-(--accent-primary) px-0.5 text-[9px] font-bold leading-none text-white tabular-nums">
          {badgeText}
        </span>
      )}
    </Link>
  );
}
