'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useId, useState, useTransition } from 'react';

type Props = {
  orderId: string;
  disabled: boolean;
};

export function RefundButton({ orderId, disabled }: Props) {
  const router = useRouter();
  const t = useTranslations('shop.admin.refund');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

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

  const isDisabled = disabled || isPending;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onRefund}
        disabled={isDisabled}
        aria-busy={isPending}
        aria-describedby={error ? errorId : undefined}
        className="border-border text-foreground hover:bg-secondary rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        title={disabled ? t('onlyForPaid') : undefined}
      >
        {isPending ? t('refunding') : t('refund')}
      </button>

      {error ? (
        <span id={errorId} role="alert" className="text-destructive text-xs">
          {error}
        </span>
      ) : null}
    </div>
  );
}
