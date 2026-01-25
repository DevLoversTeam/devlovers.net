'use client';

import { Logo } from '@/components/shared/Logo';
import { DesktopNav } from '@/components/header/DesktopNav';
import { DesktopActions } from '@/components/header/DesktopActions';
import { MobileActions } from '@/components/header/MobileActions';

export type UnifiedHeaderVariant = 'platform' | 'shop' | 'blog';

export type UnifiedHeaderProps = {
  variant: UnifiedHeaderVariant;
  userExists: boolean;
  showAdminLink?: boolean;
  blogCategories?: Array<{ _id: string; title: string }>;
};

export function UnifiedHeader({
  variant,
  userExists,
  showAdminLink = false,
  blogCategories = [],
}: UnifiedHeaderProps) {
  const brandHref =
    variant === 'shop' ? '/shop' : variant === 'blog' ? '/blog' : '/';

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container-main flex h-16 items-center justify-between">
        <Logo href={brandHref} />

        <nav
          className="hidden items-center justify-center lg:flex"
          aria-label="Primary"
        >
          <DesktopNav variant={variant} blogCategories={blogCategories} />
        </nav>

        <div className="flex items-center gap-1">
          <DesktopActions
            variant={variant}
            userExists={userExists}
            showAdminLink={showAdminLink}
          />

          <MobileActions
            variant={variant}
            userExists={userExists}
            showAdminLink={showAdminLink}
            blogCategories={blogCategories}
          />
        </div>
      </div>
    </header>
  );
}
