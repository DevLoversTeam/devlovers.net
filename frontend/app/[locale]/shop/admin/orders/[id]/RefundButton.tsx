'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type Props = {
  orderId: string;
  disabled: boolean;
};

export function RefundButton({ orderId, disabled }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function onRefund() {
    setError(null);

    let res: Response;
    try {
      res = await fetch(`/api/shop/admin/orders/${orderId}/refund`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      const msg =
        err instanceof Error && err.message ? err.message : 'NETWORK_ERROR';
      setError(msg);
      return;
    }

    let json: any = null;
    try {
      json = await res.json();
    } catch {
      // ignore
    }

    if (!res.ok) {
      setError(json?.error ?? json?.code ?? `HTTP_${res.status}`);
      return;
    }

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onRefund}
        disabled={disabled || isPending}
        className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
        title={
          disabled
            ? 'Refund is only available for paid Stripe orders'
            : undefined
        }
      >
        {isPending ? 'Refunding…' : 'Refund'}
      </button>

      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
