'use client';

import { useEffect, useRef } from 'react';
<<<<<<< HEAD
=======

>>>>>>> 601e032c399164dfc128ab2dee5fe52dd66d2caf
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
