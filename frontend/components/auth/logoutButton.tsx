'use client';

import { LogOut } from 'lucide-react';
import { useLocale } from 'next-intl';
import { useTranslations } from 'next-intl';

import { logout } from '@/lib/logout';

type LogoutButtonProps = {
  iconOnly?: boolean;
};

export function LogoutButton({ iconOnly = false }: LogoutButtonProps) {
  const locale = useLocale();
  const t = useTranslations('navigation');

  const handleLogout = async () => {
    await logout();
    window.location.href = `/${locale}/login`;
  };

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={handleLogout}
        aria-label={t('logout')}
        title={t('logout')}
        className="text-muted-foreground hover:bg-secondary hover:text-foreground active:bg-secondary active:text-foreground flex h-10 w-10 items-center justify-center rounded-md transition-colors"
      >
        <LogOut className="h-5 w-5" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="group flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors text-muted-foreground hover:bg-(--accent-primary)/10 hover:text-(--accent-primary) active:bg-(--accent-primary)/20"
    >
      <div className="flex items-center gap-2">
        <LogOut className="h-4 w-4" />
        <span>{t('logout')}</span>
      </div>
    </button>
  );
}
