import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';

export function LastLoginBadge() {
  const t = useTranslations('auth.login');

  return (
    <Badge
      variant="success"
      className="pointer-events-none absolute -top-1.5 -right-1.5 z-10 dark:bg-green-900"
    >
      {t('lastUsed')}
    </Badge>
  );
}
