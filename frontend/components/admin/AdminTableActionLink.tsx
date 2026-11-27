import type { ComponentProps } from 'react';

import { Link } from '@/i18n/routing';

export function AdminTableActionLink(
  props: Pick<ComponentProps<typeof Link>, 'href' | 'children' | 'target'>
) {
  return (
    <Link
      {...props}
      className="border-border text-foreground hover:bg-secondary inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium transition-colors"
    />
  );
}
