import type React from 'react';
import { ShopShell } from '@/components/shop/shop-shell';

export default function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const showAdminNavLink = process.env.NEXT_PUBLIC_ENABLE_ADMIN === 'true';

  return (
    <ShopShell showAdminLink={showAdminNavLink}>
      <main className="mx-auto px-6 min-h-[80vh]">{children}</main>
    </ShopShell>
  );
}
