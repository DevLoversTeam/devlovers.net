'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

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
<<<<<<< HEAD
        <main className="mx-auto px-4 sm:px-6 lg:px-8 min-h-[80vh]">
=======
        <main className="mx-auto min-h-[80vh] px-4 sm:px-6 lg:px-8">
>>>>>>> develop
          {children}
        </main>
      </>
    );
  }

  return (
    <main className={isQa || isHome ? 'mx-auto' : 'mx-auto min-h-[80vh] px-6'}>
      {children}
    </main>
  );
}
