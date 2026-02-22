'use client';

import { LayoutDashboard, LogOut, Settings, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { LogoutButton } from '@/components/auth/logoutButton';
import { Link } from '@/i18n/routing';

type UserNavDropdownProps = {
  showAdminLink?: boolean;
};

export function UserNavDropdown({ showAdminLink = false }: UserNavDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const tAria = useTranslations('aria');
  const t = useTranslations('navigation');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const closeMenu = () => setIsOpen(false);

  return (
    <div className="relative flex items-center" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-(--accent-primary)/60 text-(--accent-primary) transition-colors hover:bg-(--accent-primary)/10 active:bg-(--accent-primary)/20"
        aria-label="User menu"
      >
        <User className="h-4 w-4" />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 z-70 mt-3 w-56 rounded-2xl border border-gray-200/50 bg-white/95 p-2 shadow-lg backdrop-blur-3xl dark:border-white/10 dark:bg-neutral-900/95">
          <div className="mb-2 border-b border-gray-100/50 px-2 pb-2 dark:border-white/10">
            <p className="text-sm font-semibold tracking-wide text-gray-900 dark:text-white">My Account</p>
          </div>
          <div className="flex flex-col gap-1">
            <Link
              href="/dashboard"
              onClick={closeMenu}
              className="group flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors text-muted-foreground hover:bg-(--accent-primary)/10 hover:text-(--accent-primary) active:bg-(--accent-primary)/20"
            >
              <div className="flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4" />
                <span>{tAria('dashboard')}</span>
              </div>
            </Link>

            {showAdminLink && (
              <Link
                href="/admin/shop"
                onClick={closeMenu}
                className="group flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors text-muted-foreground hover:bg-(--accent-primary)/10 hover:text-(--accent-primary) active:bg-(--accent-primary)/20"
              >
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  <span>{tAria('admin')}</span>
                </div>
              </Link>
            )}
          </div>
          <div className="mt-1 border-t border-gray-100/50 pt-1 dark:border-white/10">
            <div className="w-full" onClick={closeMenu}>
              <LogoutButton />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
