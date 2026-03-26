'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useId, useState, useTransition } from 'react';

type Props = {
  orderId: string;
  disabled: boolean;
  csrfToken: string;
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

function mapRefundError(code: string, t: (key: string) => string): string {
  switch (code) {
    case 'NETWORK_ERROR':
      return t('errors.network');
    case 'CSRF_REJECTED':
      return t('errors.security');
    case 'REFUND_PROVIDER_NOT_STRIPE':
    case 'REFUND_ORDER_NOT_PAID':
      return t('errors.refundNotAvailable');
    case 'REFUND_MISSING_PSP_TARGET':
      return t('errors.missingPaymentReference');
    case 'REFUND_ORDER_MONEY_INVALID':
      return t('errors.invalidAmount');
    case 'PSP_UNAVAILABLE':
      return t('errors.providerUnavailable');
    case 'ADMIN_API_DISABLED':
      return t('errors.adminDisabled');
    case 'INTERNAL_ERROR':
    case 'HTTP_500':
      return t('errors.generic');
    default:
      return t('errors.generic');
  }
}

export function RefundButton({ orderId, disabled, csrfToken }: Props) {
  const router = useRouter();
  const t = useTranslations('shop.orders.detail.paymentControls');
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  async function onRefund() {
    if (disabled || isSubmitting || isPending) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    let res: Response;
    try {
      res = await fetch(`/api/shop/admin/orders/${orderId}/refund`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
      });
    } catch (err) {
      setError(mapRefundError(normalizeActionErrorCode(err), t));
      setIsSubmitting(false);
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
        mapRefundError(
          json?.error ?? json?.code ?? json?.message ?? `HTTP_${res.status}`,
          t
        )
      );
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    startTransition(() => {
      router.refresh();
    });
  }

  const isDisabled = disabled || isSubmitting || isPending;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onRefund}
        disabled={isDisabled}
        aria-busy={isSubmitting || isPending}
        aria-describedby={error ? errorId : undefined}
        className="w-full rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-left text-sm font-medium text-amber-100 transition-colors hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-50"
        title={disabled ? t('onlyForPaidStripe') : undefined}
      >
        {isPending ? t('refunding') : t('refund')}
      </button>

      {error ? (
        <span
          id={errorId}
          role="alert"
          className="block rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-100"
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}
