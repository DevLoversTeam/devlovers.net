'use client';

import { useSelectedLayoutSegments } from 'next/navigation';
import React from 'react';

import { UnifiedHeader } from '@/components/header/UnifiedHeader';
import { CartProvider } from '@/components/shop/CartProvider';

type AppChromeProps = {
  userExists: boolean;
  userId?: string | null;
  showAdminLink?: boolean;
  blogCategories?: Array<{ _id: string; title: string }>;
  children: React.ReactNode;
};

export function AppChrome({
  userExists,
  userId = null,
  showAdminLink = false,
  blogCategories = [],
  children,
}: AppChromeProps) {
  const segments = useSelectedLayoutSegments();
  const isShop = segments.includes('shop');
  const isBlog = segments.includes('blog');

  if (isShop) {
    return (
      <CartProvider cartOwnerId={userId} key={`cart:${userId ?? 'guest'}`}>
        <div className="shop-scope min-h-screen">
          <UnifiedHeader
            variant="shop"
            userExists={userExists}
            showAdminLink={showAdminLink}
            blogCategories={blogCategories}
          />
          {children}
        </div>
      </CartProvider>
    );
  }

  if (isBlog) {
    return <>{children}</>;
  }

  return (
    <>
      <UnifiedHeader
        variant="platform"
        userExists={userExists}
        blogCategories={blogCategories}
      />
      {children}
    </>
  );
}
