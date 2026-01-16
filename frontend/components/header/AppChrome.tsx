'use client';

import React from 'react';
import { useSelectedLayoutSegments } from 'next/navigation';

import { UnifiedHeader } from '@/components/header/UnifiedHeader';
import { CartProvider } from '@/components/shop/cart-provider';

type AppChromeProps = {
  userExists: boolean;
  showAdminLink?: boolean;
  children: React.ReactNode;
};

export function AppChrome({ userExists, showAdminLink = false, children }: AppChromeProps) {
  const segments = useSelectedLayoutSegments();
  const isShop = segments.includes('shop');

  if (isShop) {
    return (
      <CartProvider>
        <div className="shop-scope min-h-screen">
          <UnifiedHeader
            variant="shop"
            userExists={userExists}
            showAdminLink={showAdminLink}
          />
          {children}
        </div>
      </CartProvider>
    );
  }

  return (
    <>
      <UnifiedHeader variant="platform" userExists={userExists} showAdminLink={showAdminLink}/>
      {children}
    </>
  );
}
