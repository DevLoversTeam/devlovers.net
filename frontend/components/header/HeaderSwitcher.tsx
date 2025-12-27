'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import SiteHeader from '@/components/header/SiteHeader';

/**
 * pathname приклади:
 *  /en
 *  /en/about
 *  /en/shop
 *  /en/shop/products
 *  /shop (на випадок, якщо колись буде без locale)
 *
 * segments:
 *  /en/shop -> ["en", "shop", ...]
 *  /shop    -> ["shop", ...]
 */
function isShopPath(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean);
  return segments[0] === 'shop' || segments[1] === 'shop';
}

export function HeaderSwitcher({ userExists }: { userExists: boolean }) {
  const pathname = usePathname();

  // Shop header рендериться всередині ShopShell → тут не показуємо site header
  if (isShopPath(pathname)) return null;

  return <SiteHeader userExists={userExists} />;
}

export function MainSwitcher({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // ShopLayout сам робить <main> всередині ShopShell → тут НЕ обгортаємо
  if (isShopPath(pathname)) return <>{children}</>;

  return <main className="mx-auto px-6 min-h-[80vh]">{children}</main>;
}
