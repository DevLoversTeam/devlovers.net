'use client';

import { LogIn } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { BlogHeaderSearch } from '@/components/blog/BlogHeaderSearch';
import { HeaderButton } from '@/components/shared/HeaderButton';
import LanguageSwitcher from '@/components/shared/LanguageSwitcher';
import { CartButton } from '@/components/shop/header/CartButton';
import { NotificationBell } from './NotificationBell';
import { UserNavDropdown } from './UserNavDropdown';

type DesktopActionsProps = {
  variant: 'platform' | 'shop' | 'blog';
  userExists: boolean;
  showAdminLink?: boolean;
};

export function DesktopActions({
  variant,
  userExists,
  showAdminLink = false,
}: DesktopActionsProps) {
  const t = useTranslations('navigation');
  const tAria = useTranslations('aria');
  const isShop = variant === 'shop';
  const isBlog = variant === 'blog';

  return (
    <div className="hidden items-center gap-2 min-[1050px]:flex">
      {isBlog && <BlogHeaderSearch />}

      <LanguageSwitcher />

      {!userExists ? (
        <HeaderButton href="/login" icon={LogIn}>
          {t('login')}
        </HeaderButton>
      ) : (
        <>
          <NotificationBell />
          <UserNavDropdown showAdminLink={showAdminLink} />
        </>
      )}
    </div>
  );
}
