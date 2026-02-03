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
      className="group bg-secondary text-secondary-foreground relative inline-flex w-fit items-center gap-2 overflow-hidden rounded-lg px-4 py-2 text-sm font-medium transition-all duration-500 hover:text-white active:text-white"
    >
      <span
        className="absolute inset-0 opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100 group-active:opacity-100"
        style={{
          background:
            'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-hover) 100%)',
        }}
        aria-hidden="true"
      />

      <span
        className="absolute inset-0 translate-x-[-100%] transition-transform duration-1000 ease-in-out group-hover:translate-x-[100%] group-active:translate-x-[100%]"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
          transform: 'skewX(-20deg)',
        }}
        aria-hidden="true"
      />

      <span className="relative z-10 flex items-center gap-2">
        <LogOut className="h-4 w-4 transition-transform duration-300 group-hover:scale-110 group-active:scale-110" />
        {t('logout')}
      </span>
    </button>
  );
}
