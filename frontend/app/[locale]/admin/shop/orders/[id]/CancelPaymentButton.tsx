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

function mapCancelPaymentError(
  code: string,
  t: (key: string) => string
): string {
  switch (code) {
    case 'NETWORK_ERROR':
      return t('errors.network');
    case 'CSRF_REJECTED':
      return t('errors.security');
    case 'CANCEL_DISABLED':
      return t('errors.cancelPaymentDisabled');
    case 'CANCEL_PROVIDER_NOT_MONOBANK':
    case 'CANCEL_NOT_ALLOWED':
      return t('errors.cancelPaymentNotAvailable');
    case 'CANCEL_MISSING_PROVIDER_REF':
      return t('errors.missingPaymentReference');
    case 'CANCEL_IN_PROGRESS':
      return t('errors.cancelPaymentInProgress');
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

export function CancelPaymentButton({ orderId, disabled, csrfToken }: Props) {
  const router = useRouter();
  const t = useTranslations('shop.orders.detail.paymentControls');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  async function onCancelPayment() {
    setError(null);

    let res: Response;
    try {
      res = await fetch(`/api/shop/admin/orders/${orderId}/cancel-payment`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
      });
    } catch (err) {
      setError(mapCancelPaymentError(normalizeActionErrorCode(err), t));
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
        mapCancelPaymentError(
          json?.error ?? json?.code ?? json?.message ?? `HTTP_${res.status}`,
          t
        )
      );
      return;
    }

    startTransition(() => {
      router.refresh();
    });
  }

  const isDisabled = disabled || isPending;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onCancelPayment}
        disabled={isDisabled}
        aria-busy={isPending}
        aria-describedby={error ? errorId : undefined}
        className="w-full rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-left text-sm font-medium text-sky-100 transition-colors hover:bg-sky-500/10 disabled:cursor-not-allowed disabled:opacity-50"
        title={disabled ? t('onlyForUnpaidMonobank') : undefined}
      >
        {isPending ? t('cancelingPayment') : t('cancelUnpaidPayment')}
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
