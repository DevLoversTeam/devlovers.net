'use client';

import { DesktopActions } from '@/components/header/DesktopActions';
import { DesktopNav } from '@/components/header/DesktopNav';
import { MobileActions } from '@/components/header/MobileActions';
import { useMobileMenu } from '@/components/header/MobileMenuContext';
import { GitHubStarButton } from '@/components/shared/GitHubStarButton';
import { Loader } from '@/components/shared/Loader';
import { Logo } from '@/components/shared/Logo';

import { MobileMenuProvider } from './MobileMenuContext';

export type UnifiedHeaderVariant = 'platform' | 'shop' | 'blog';

export type UnifiedHeaderProps = {
  variant: UnifiedHeaderVariant;
  userExists: boolean;
  showAdminLink?: boolean;
  blogCategories?: Array<{ _id: string; title: string }>;
};

function HeaderContent({
  variant,
  userExists,
  showAdminLink = false,
  blogCategories = [],
}: UnifiedHeaderProps) {
  const brandHref = '/';
  const { isPending } = useMobileMenu();

  return (
    <>
      <header className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 w-full border-b backdrop-blur">
        <div className="container-main flex h-16 items-center justify-between">
          <Logo href={brandHref} />

          <nav
            className="hidden items-center justify-center lg:flex"
            aria-label="Primary"
          >
            <DesktopNav variant={variant} blogCategories={blogCategories} />
          </nav>

          <div className="flex items-center gap-2">
            <GitHubStarButton />

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

      {isPending && (
        <div className="bg-background/95 fixed top-[65px] right-0 bottom-0 left-0 z-[60] flex items-center justify-center backdrop-blur-md">
          <Loader size={120} />
        </div>
      )}
    </>
  );
}

export function UnifiedHeader(props: UnifiedHeaderProps) {
  return (
    <MobileMenuProvider>
      <HeaderContent {...props} />
    </MobileMenuProvider>
  );
}
