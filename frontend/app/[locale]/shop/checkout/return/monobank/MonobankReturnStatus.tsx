'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Link, useRouter } from '@/i18n/routing';
import {
  type CurrencyCode,
  currencyValues,
  formatMoneyCode,
} from '@/lib/shop/currency';
import {
  SHOP_FOCUS,
  SHOP_OUTLINE_BTN_BASE,
  SHOP_OUTLINE_BTN_INTERACTIVE,
} from '@/lib/shop/ui-classes';
import { cn } from '@/lib/utils';

type MonobankReturnStatusProps = {
  orderId: string;
  statusToken: string | null;
  locale: string;
};

type LiteOrderStatus = {
  id: string;
  paymentStatus: string;
  totalAmountMinor: number;
  currency: CurrencyCode;
  itemsCount: number;
};
type PaymentStatusLabelKey =
  | 'paymentStatus.paid'
  | 'paymentStatus.failed'
  | 'paymentStatus.refunded'
  | 'paymentStatus.pending'
  | 'paymentStatus.confirming'
  | 'paymentStatus.needsReview'
  | 'paymentStatus.unknown';
const POLL_DELAY_MS = 2_500;
const TERMINAL_NON_PAID = new Set([
  'failed',
  'refunded',
  'requires_payment',
  'canceled',
  'needs_review',
]);

const SHOP_OUTLINE_BTN = cn(
  SHOP_OUTLINE_BTN_BASE,
  SHOP_OUTLINE_BTN_INTERACTIVE,
  SHOP_FOCUS
);

function normalizeToken(token: string | null): string | null {
  if (!token) return null;
  const normalized = token.trim();
  return normalized.length ? normalized : null;
}

function getStatusLabelKey(status: string): PaymentStatusLabelKey {
  if (status === 'paid') return 'paymentStatus.paid';
  if (status === 'failed') return 'paymentStatus.failed';
  if (status === 'refunded') return 'paymentStatus.refunded';
  if (status === 'pending') return 'paymentStatus.pending';
  if (status === 'requires_payment') return 'paymentStatus.confirming';
  if (status === 'needs_review') return 'paymentStatus.needsReview';
  return 'paymentStatus.unknown';
}

function parseStatusPayload(payload: unknown): LiteOrderStatus | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  if (
    typeof root.id !== 'string' ||
    typeof root.paymentStatus !== 'string' ||
    typeof root.totalAmountMinor !== 'number' ||
    !currencyValues.includes(root.currency as CurrencyCode) ||
    typeof root.itemsCount !== 'number'
  ) {
    return null;
  }

  return {
    id: root.id,
    paymentStatus: root.paymentStatus,
    totalAmountMinor: root.totalAmountMinor,
    currency: root.currency as CurrencyCode,
    itemsCount: root.itemsCount,
  };
}

export default function MonobankReturnStatus({
  orderId,
  statusToken,
  locale,
}: MonobankReturnStatusProps) {
  const t = useTranslations('shop.checkout');
  const router = useRouter();

  const [status, setStatus] = useState<LiteOrderStatus | null>(null);
  const [isPolling, setIsPolling] = useState(true);
  const [pollError, setPollError] = useState<string | null>(null);
  const [refreshSeed, setRefreshSeed] = useState(0);

  const normalizedToken = normalizeToken(statusToken);

  const fetchStatus = useCallback(async (): Promise<LiteOrderStatus | null> => {
    const params = new URLSearchParams({ view: 'lite' });
    if (normalizedToken) params.set('statusToken', normalizedToken);

    const response = await fetch(
      `/api/shop/orders/${encodeURIComponent(orderId)}/status?${params.toString()}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      }
    );

    const payload = await response.json().catch(() => null);
    if (!response.ok) return null;

    return parseStatusPayload(payload);
  }, [normalizedToken, orderId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      if (cancelled) return;

      try {
        const nextStatus = await fetchStatus();
        if (!nextStatus) {
          if (!cancelled) {
            setPollError(t('errors.tryAgainLater'));
            timer = setTimeout(poll, POLL_DELAY_MS);
          }
          return;
        }

        if (cancelled) return;

        setStatus(nextStatus);
        setPollError(null);

        if (nextStatus.paymentStatus === 'paid') {
          const qp = new URLSearchParams({
            orderId,
            flow: 'monobank',
            clearCart: '1',
          });
          if (normalizedToken) qp.set('statusToken', normalizedToken);
          router.replace(`/shop/checkout/success?${qp.toString()}`);
          return;
        }

        if (TERMINAL_NON_PAID.has(nextStatus.paymentStatus)) {
          const qp = new URLSearchParams({ orderId });
          if (normalizedToken) qp.set('statusToken', normalizedToken);
          router.replace(`/shop/checkout/error?${qp.toString()}`);
          return;
        }

        timer = setTimeout(poll, POLL_DELAY_MS);
      } catch {
        if (!cancelled) {
          setPollError(t('errors.tryAgainLater'));
          timer = setTimeout(poll, POLL_DELAY_MS);
        }
      }
    }

    void poll().finally(() => {
      if (!cancelled) setIsPolling(false);
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [fetchStatus, normalizedToken, orderId, refreshSeed, router, t]);

  const statusLabel = useMemo(() => {
    if (!status) return t('paymentStatus.confirming');
    return t(getStatusLabelKey(status.paymentStatus));
  }, [status, t]);

  return (
    <section className="border-border bg-card rounded-lg border p-8">
      <h1 className="text-foreground text-2xl font-bold">
        {t('monobankReturn.processing')}
      </h1>

      <p className="text-muted-foreground mt-2 text-sm">
        {t('monobankReturn.checking')}
      </p>

      <div className="border-border bg-muted/30 mt-6 rounded-md border p-4">
        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">{t('error.orderLabel')}</dt>
            <dd className="text-foreground font-medium">{orderId}</dd>
          </div>

          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">{t('error.statusLabel')}</dt>
            <dd className="text-foreground font-semibold">{statusLabel}</dd>
          </div>

          {status ? (
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">
                {t('success.totalAmount')}
              </dt>
              <dd className="text-foreground font-semibold">
                {formatMoneyCode(
                  status.totalAmountMinor,
                  status.currency,
                  locale
                )}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>

      {pollError ? (
        <p className="text-destructive mt-4 text-sm" role="status">
          {pollError}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          className={SHOP_OUTLINE_BTN}
          onClick={() => {
            setPollError(null);
            setIsPolling(true);
            setRefreshSeed(seed => seed + 1);
          }}
          disabled={isPolling}
        >
          {t('monobankReturn.refresh')}
        </button>

        <Link href="/shop/cart" className={SHOP_OUTLINE_BTN}>
          {t('actions.backToCart')}
        </Link>
      </div>
    </section>
  );
}
