'use client';

import { BlogHeaderSearch } from '@/components/blog/BlogHeaderSearch';
import { AppMobileMenu } from '@/components/header/AppMobileMenu';
import LanguageSwitcher from '@/components/shared/LanguageSwitcher';
import { CartButton } from '@/components/shop/header/CartButton';

type Category = {
  _id: string;
  title: string;
};

type MobileActionsProps = {
  variant: 'platform' | 'shop' | 'blog';
  userExists: boolean;
  showAdminLink?: boolean;
  blogCategories?: Category[];
};

export function MobileActions({
  variant,
  userExists,
  showAdminLink = false,
  blogCategories = [],
}: MobileActionsProps) {
  const isShop = variant === 'shop';
  const isBlog = variant === 'blog';

  return (
    <div className="flex items-center gap-1 lg:hidden">
      <LanguageSwitcher />
      {isBlog && <BlogHeaderSearch />}
      {isShop && <CartButton />}
      <AppMobileMenu
        variant={variant}
        userExists={userExists}
        showAdminLink={showAdminLink}
        blogCategories={blogCategories}
      />
    </div>
  );
}
