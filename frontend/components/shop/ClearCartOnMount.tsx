'use client';

import { useEffect, useRef } from 'react';
import { useCart } from '@/components/shop/CartProvider';

type ClearCartOnMountProps = {
  enabled?: boolean;
};

export function ClearCartOnMount({ enabled = true }: ClearCartOnMountProps) {
  const { clearCart } = useCart();
  const didRunRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (didRunRef.current) return;
    didRunRef.current = true;

    clearCart();
  }, [enabled, clearCart]);

  return null;
}
