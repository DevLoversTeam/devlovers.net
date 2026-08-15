import { useTranslations } from 'next-intl';

import { OAuthButtons } from '@/components/auth/OAuthButtons';
import type { LastLoginMethod } from '@/lib/auth-last-login';

export function AuthProvidersBlock({
  lastLoginMethod = null,
}: {
  lastLoginMethod?: LastLoginMethod | null;
}) {
  const t = useTranslations('auth');

  return (
    <>
      <OAuthButtons lastLoginMethod={lastLoginMethod} />

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs text-gray-500">{t('divider')}</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>
    </>
  );
}
