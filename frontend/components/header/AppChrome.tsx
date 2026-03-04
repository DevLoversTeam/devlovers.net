'use client';

import { useSelectedLayoutSegments } from 'next/navigation';
import React from 'react';

import { UnifiedHeader } from '@/components/header/UnifiedHeader';
import { CartProvider } from '@/components/shop/CartProvider';
import { useAuth } from '@/hooks/useAuth';

type AppChromeProps = {
  enableAdminFeature?: boolean;
  blogCategories?: Array<{ id: string; slug: string; title: string }>;
  children: React.ReactNode;
};

export function AppChrome({
  enableAdminFeature = false,
  blogCategories = [],
  children,
}: AppChromeProps) {
  const { userExists, userId, isAdmin } = useAuth();
  const segments = useSelectedLayoutSegments();
  const isShop = segments.includes('shop');
  const isBlog = segments.includes('blog');
  const showAdminLink = userExists && isAdmin && enableAdminFeature;

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
        showAdminLink={showAdminLink}
        blogCategories={blogCategories}
      />
      {children}
    </>
  );
}
