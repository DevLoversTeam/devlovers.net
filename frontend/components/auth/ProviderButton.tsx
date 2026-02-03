'use client';

import { ReactNode } from 'react';

import { Button } from '@/components/ui/button';

type ProviderButtonProps = {
  provider: 'google' | 'github';
  label: string;
  icon: ReactNode;
};

export function ProviderButton({ provider, label, icon }: ProviderButtonProps) {
  function oauthLogin() {
    window.location.href = `/api/auth/${provider}`;
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="flex w-full items-center justify-center gap-2"
      onClick={oauthLogin}
    >
      {icon}
      <span>{label}</span>
    </Button>
  );
}
