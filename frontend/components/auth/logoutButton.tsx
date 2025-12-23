'use client';

import { useLocale } from 'next-intl';
import { LogOut } from 'lucide-react';

import { logout } from '@/lib/logout';

type LogoutButtonProps = {
  iconOnly?: boolean;
};

export function LogoutButton({ iconOnly = false }: LogoutButtonProps) {
  const locale = useLocale();

  const handleLogout = async () => {
    await logout();
    window.location.href = `/${locale}/login`;
  };

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={handleLogout}
        aria-label="Log out"
        title="Log out"
        className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <LogOut className="h-5 w-5" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="inline-flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-sm font-medium text-foreground transition-colors hover:opacity-90"
    >
      <LogOut className="h-4 w-4" />
      Log out
    </button>
  );
}
