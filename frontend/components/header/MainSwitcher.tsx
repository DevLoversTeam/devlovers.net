'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { UnifiedHeader } from '@/components/header/UnifiedHeader';

function isShopPath(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean);
  return segments[0] === 'shop' || segments[1] === 'shop';
}

function isBlogPath(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean);
  return segments[0] === 'blog' || segments[1] === 'blog';
}

function isQaPath(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean);
  return segments[0] === 'q&a' || segments[1] === 'q&a';
}

function isHomePath(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean);
  return (
    segments.length === 0 ||
    (segments.length === 1 && ['en', 'pl', 'uk'].includes(segments[0]))
  );
}

type MainSwitcherProps = {
  children: ReactNode;
  userExists: boolean;
  showAdminLink?: boolean;
  blogCategories?: Array<{ _id: string; title: string }>;
};

export function MainSwitcher({
  children,
  userExists,
  showAdminLink = false,
  blogCategories = [],
}: MainSwitcherProps) {
  const pathname = usePathname();
  const isQa = isQaPath(pathname);
  const isHome = isHomePath(pathname);

  if (isShopPath(pathname)) return <>{children}</>;

  if (isBlogPath(pathname)) {
    return (
      <>
        <UnifiedHeader
          variant="blog"
          userExists={userExists}
          showAdminLink={showAdminLink}
          blogCategories={blogCategories}
        />
        <main className="mx-auto px-6 min-h-[80vh]">{children}</main>
      </>
    );
  }

  return (
    <main className={isQa || isHome ? 'mx-auto' : 'mx-auto px-6 min-h-[80vh]'}>
      {children}
    </main>
  );
}
