'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';

type ActionName = 'retry_label_creation' | 'mark_shipped' | 'mark_delivered';

type Props = {
  orderId: string;
  csrfToken: string;
  shippingStatus: string | null;
  shipmentStatus: string | null;
};

function actionEnabled(args: {
  action: ActionName;
  shippingStatus: string | null;
  shipmentStatus: string | null;
}): boolean {
  if (args.action === 'retry_label_creation') {
    return (
      args.shipmentStatus === 'failed' || args.shipmentStatus === 'needs_attention'
    );
  }
  if (args.action === 'mark_shipped') {
    return args.shippingStatus === 'label_created';
  }
  return args.shippingStatus === 'shipped';
}

export function ShippingActions({
  orderId,
  csrfToken,
  shippingStatus,
  shipmentStatus,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  async function runAction(action: ActionName) {
    setError(null);

    let res: Response;
    try {
      res = await fetch(`/api/shop/admin/orders/${orderId}/shipping`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ action }),
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
      setError(json?.code ?? json?.message ?? `HTTP_${res.status}`);
      return;
    }

    startTransition(() => {
      router.refresh();
    });
  }

  const retryEnabled = actionEnabled({
    action: 'retry_label_creation',
    shippingStatus,
    shipmentStatus,
  });
  const shippedEnabled = actionEnabled({
    action: 'mark_shipped',
    shippingStatus,
    shipmentStatus,
  });
  const deliveredEnabled = actionEnabled({
    action: 'mark_delivered',
    shippingStatus,
    shipmentStatus,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => runAction('retry_label_creation')}
          disabled={isPending || !retryEnabled}
          aria-busy={isPending}
          className="border-border text-foreground hover:bg-secondary rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          Retry label creation
        </button>

        <button
          type="button"
          onClick={() => runAction('mark_shipped')}
          disabled={isPending || !shippedEnabled}
          aria-busy={isPending}
          className="border-border text-foreground hover:bg-secondary rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          Mark shipped
        </button>

        <button
          type="button"
          onClick={() => runAction('mark_delivered')}
          disabled={isPending || !deliveredEnabled}
          aria-busy={isPending}
          className="border-border text-foreground hover:bg-secondary rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          Mark delivered
        </button>
      </div>

      {error ? (
        <p id={errorId} role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
