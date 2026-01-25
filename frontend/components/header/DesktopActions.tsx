'use client';

import { useTranslations } from 'next-intl';
import { LogIn, Settings, User } from 'lucide-react';

import { HeaderButton } from '@/components/shared/HeaderButton';
import { GitHubStarButton } from '@/components/shared/GitHubStarButton';
import LanguageSwitcher from '@/components/shared/LanguageSwitcher';
import { LogoutButton } from '@/components/auth/logoutButton';
import { CartButton } from '@/components/shop/header/cart-button';
import { BlogHeaderSearch } from '@/components/blog/BlogHeaderSearch';

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
  const isShop = variant === 'shop';
  const isBlog = variant === 'blog';

  return (
    <div className="hidden items-center gap-2 lg:flex">
      {userExists && (
        <HeaderButton
          variant="icon"
          href="/dashboard"
          icon={User}
          label="Dashboard"
        />
      )}

      {showAdminLink && (
        <HeaderButton
          variant="icon"
          href="/shop/admin"
          icon={Settings}
          label="Shop admin"
        />
      )}

      {isBlog && <BlogHeaderSearch />}

      <LanguageSwitcher />
      <GitHubStarButton />

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
