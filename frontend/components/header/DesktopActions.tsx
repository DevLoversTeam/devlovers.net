'use client';

import { LogIn, Settings, User } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { LogoutButton } from '@/components/auth/logoutButton';
import { BlogHeaderSearch } from '@/components/blog/BlogHeaderSearch';
import { HeaderButton } from '@/components/shared/HeaderButton';
import LanguageSwitcher from '@/components/shared/LanguageSwitcher';
import { CartButton } from '@/components/shop/header/CartButton';

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

      {userExists && (
        <HeaderButton
          variant="icon"
          href="/dashboard"
          icon={User}
          label={tAria('dashboard')}
        />
      )}

      {showAdminLink && (
        <HeaderButton
          variant="icon"
          href="/admin/shop"
          icon={Settings}
          label={tAria('admin')}
        />
      )}

      {isShop && <CartButton />}

      {!userExists ? (
        <HeaderButton href="/login" icon={LogIn}>
          {t('login')}
        </HeaderButton>
      ) : (
        <LogoutButton />
      )}
    </div>
  );
}
