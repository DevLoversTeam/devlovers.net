'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useId, useState, useTransition } from 'react';

type ActionName =
  | 'recover_initial_shipment'
  | 'retry_label_creation'
  | 'mark_shipped'
  | 'mark_delivered';

type Props = {
  orderId: string;
  csrfToken: string;
  shippingStatus: string | null;
  shipmentStatus: string | null;
};

function normalizeActionErrorCode(error: unknown): string {
  if (error instanceof TypeError) {
    return 'NETWORK_ERROR';
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'NETWORK_ERROR';
}

function mapShippingError(code: string, t: (key: string) => string): string {
  switch (code) {
    case 'NETWORK_ERROR':
      return t('errors.network');
    case 'CSRF_REJECTED':
      return t('errors.security');
    case 'SHIPMENT_ALREADY_EXISTS':
    case 'SHIPMENT_RECOVERY_NOT_ALLOWED':
      return t('errors.recoverNotAvailable');
    case 'SHIPMENT_NOT_FOUND':
      return t('errors.shipmentMissing');
    case 'RETRY_NOT_ALLOWED':
      return t('errors.retryNotAvailable');
    case 'INVALID_SHIPPING_TRANSITION':
      return t('errors.transitionNotAvailable');
    case 'ADMIN_API_DISABLED':
      return t('errors.adminDisabled');
    case 'INTERNAL_ERROR':
    case 'HTTP_500':
      return t('errors.generic');
    default:
      return t('errors.generic');
  }
}

function actionEnabled(args: {
  action: ActionName;
  shippingStatus: string | null;
  shipmentStatus: string | null;
}): boolean {
  if (args.action === 'recover_initial_shipment') {
    const queueableShippingStatus =
      args.shippingStatus == null ||
      args.shippingStatus === 'pending' ||
      args.shippingStatus === 'queued' ||
      args.shippingStatus === 'creating_label' ||
      args.shippingStatus === 'needs_attention';

    return (
      queueableShippingStatus &&
      (args.shipmentStatus == null || args.shipmentStatus === 'queued')
    );
  }

  if (args.action === 'retry_label_creation') {
    return (
      args.shipmentStatus === 'failed' ||
      args.shipmentStatus === 'needs_attention'
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
  const t = useTranslations('shop.orders.detail.shippingControls');
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
      setError(mapShippingError(normalizeActionErrorCode(err), t));
      return;
    }

    let json: any = null;
    try {
      json = await res.json();
    } catch {
      // ignore
    }

    if (!res.ok) {
      setError(
        mapShippingError(json?.code ?? json?.message ?? `HTTP_${res.status}`, t)
      );
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
  const recoverEnabled = actionEnabled({
    action: 'recover_initial_shipment',
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
  const visibleActions: Array<{
    action: ActionName;
    label: string;
    tone?: 'default' | 'emphasis';
  }> = [];

  if (recoverEnabled) {
    visibleActions.push({
      action: 'recover_initial_shipment',
      label: t('recoverInitialShipment'),
    });
  }

  if (retryEnabled) {
    visibleActions.push({
      action: 'retry_label_creation',
      label: t('retryLabelCreation'),
    });
  }

  if (shippedEnabled) {
    visibleActions.push({
      action: 'mark_shipped',
      label: t('markShipped'),
      tone: 'emphasis',
    });
  }

  if (deliveredEnabled) {
    visibleActions.push({
      action: 'mark_delivered',
      label: t('markDelivered'),
      tone: 'emphasis',
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2">
        {visibleActions.map(({ action, label, tone }) => (
          <button
            key={action}
            type="button"
            onClick={() => runAction(action)}
            disabled={isPending}
            aria-busy={isPending}
            className={
              tone === 'emphasis'
                ? 'rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-left text-sm font-medium text-emerald-100 transition-colors hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-50'
                : 'border-border text-foreground hover:bg-secondary/70 bg-background/40 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50'
            }
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <p
          id={errorId}
          role="alert"
          className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-100"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
