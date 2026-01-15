import type React from 'react';

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto px-6 min-h-[80vh]">{children}</main>;
}