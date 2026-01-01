'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

function isShopPath(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean);
  return segments[0] === 'shop' || segments[1] === 'shop';
}

export function MainSwitcher({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // shop layout вже має <main>, тут не обгортаємо
  if (isShopPath(pathname)) return <>{children}</>;

  return <main className="mx-auto px-6 min-h-[80vh]">{children}</main>;
}
