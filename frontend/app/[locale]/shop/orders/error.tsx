'use client';

import {
  SHOP_FOCUS,
  SHOP_OUTLINE_BTN_BASE,
  SHOP_OUTLINE_BTN_INTERACTIVE,
} from '@/lib/shop/ui-classes';
import { cn } from '@/lib/utils';

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

const SHOP_OUTLINE_BTN = cn(
  SHOP_OUTLINE_BTN_BASE,
  SHOP_OUTLINE_BTN_INTERACTIVE,
  SHOP_FOCUS
);

export default function OrdersError({ reset }: ErrorPageProps) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold">Orders</h1>
      </header>

      <section className="border-border bg-card mt-6 rounded-lg border p-5">
        <p className="text-muted-foreground text-sm">Failed to load orders.</p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className={SHOP_OUTLINE_BTN} onClick={reset}>
            Try again
          </button>
        </div>
      </section>
    </div>
  );
}
