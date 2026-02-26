import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
