'use client';

import { ReactNode } from 'react';

import { LastLoginBadge } from '@/components/auth/LastLoginBadge';
import { Button } from '@/components/ui/button';

type ProviderButtonProps = {
  provider: 'google' | 'github';
  label: string;
  icon: ReactNode;
  isLastUsed?: boolean;
};

export function ProviderButton({
  provider,
  label,
  icon,
  isLastUsed,
}: ProviderButtonProps) {
  function oauthLogin() {
    window.location.href = `/api/auth/${provider}`;
  }

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        className="flex w-full items-center justify-center gap-2"
        onClick={oauthLogin}
      >
        {icon}
        <span>{label}</span>
      </Button>
      {isLastUsed && <LastLoginBadge />}
    </div>
  );
}
