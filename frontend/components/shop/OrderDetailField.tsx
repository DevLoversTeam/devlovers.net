import type { ReactNode } from 'react';

export function OrderDetailField({
  label,
  children,
  breakAll,
}: {
  label: ReactNode;
  children: ReactNode;
  breakAll?: boolean;
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={breakAll ? 'text-sm break-all' : 'text-sm'}>{children}</dd>
    </div>
  );
}
