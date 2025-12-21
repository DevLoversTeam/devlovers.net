"use client";

import { useLocale } from 'next-intl';
import { logout } from "@/lib/logout";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const locale = useLocale();
  const handleLogout = async () => {
    await logout();
    window.location.href = `/${locale}/login`;
  };
  return (
    <Button variant="outline" onClick={handleLogout}>
      Log out
    </Button>
  );
}