'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Link } from '@/i18n/routing';
import { formatMoneyCode } from '@/lib/shop/currency';
import { type PaymentStatus } from '@/lib/shop/payments';
import {
  SHOP_CTA_BASE,
  SHOP_CTA_INSET,
  SHOP_CTA_INTERACTIVE,
  SHOP_CTA_WAVE,
  SHOP_FOCUS,
  SHOP_OUTLINE_BTN_BASE,
  SHOP_OUTLINE_BTN_INTERACTIVE,
  shopCtaGradient,
} from '@/lib/shop/ui-classes';
import { cn } from '@/lib/utils';

type Props = {
  orderId: string;
  locale: string;
  initialStatusToken: string | null;
  paymentsDisabled: boolean;
};

type OrderStatusModel = {
  id: string;
  currency: 'UAH';
  totalAmountMinor: number;
  paymentStatus: string;
  itemsCount: number;
};

type StatusResult =
  | { ok: true; order: OrderStatusModel }
  | { ok: false; code: string };

type RefreshOutcome =
  | { kind: 'order'; paymentStatus: string }
  | { kind: 'error'; code: string };

type StatusUiState = 'pending' | 'paid' | 'canceled' | 'needs_review';

type StatusUiViewModel = {
  uiState: StatusUiState;
  headlineKey: string;
  messageKey: string;
  isTerminal: boolean;
};

const STATUS_TOKEN_KEY_PREFIX = 'shop:order-status-token:';
const POLL_MAX_ATTEMPTS = 10;
const POLL_MAX_DURATION_MS = 2 * 60 * 1000;
const POLL_BASE_DELAY_MS = 1_500;
const POLL_MAX_DELAY_MS = 12_000;
const POLL_BUSY_RETRY_DELAY_MS = 250;
const POLL_STOP_ERROR_CODES = new Set([
  'STATUS_TOKEN_REQUIRED',
  'STATUS_TOKEN_INVALID',
  'UNAUTHORIZED',
  'FORBIDDEN',
]);
const POLL_ACTIVE_STATUSES = new Set<PaymentStatus>([
  'pending',
  'requires_payment',
]);

const SHOP_HERO_CTA_SM = cn(
  SHOP_CTA_BASE,
  SHOP_CTA_INTERACTIVE,
  SHOP_FOCUS,
  'items-center justify-center overflow-hidden',
  'px-4 py-2 text-sm text-white',
  'shadow-[var(--shop-hero-btn-shadow)] hover:shadow-[var(--shop-hero-btn-shadow-hover)]'
);

const SHOP_OUTLINE_BTN = cn(
  SHOP_OUTLINE_BTN_BASE,
  SHOP_OUTLINE_BTN_INTERACTIVE,
  SHOP_FOCUS
);

function HeroCtaInner({ children }: { children: React.ReactNode }) {
  return (
    <>
      <span
        className="absolute inset-0"
        style={shopCtaGradient(
          '--shop-hero-btn-bg',
          '--shop-hero-btn-bg-hover'
        )}
        aria-hidden="true"
      />
      <span
        className={SHOP_CTA_WAVE}
        style={shopCtaGradient(
          '--shop-hero-btn-bg-hover',
          '--shop-hero-btn-bg'
        )}
        aria-hidden="true"
      />
      <span className={SHOP_CTA_INSET} aria-hidden="true" />
      <span className="relative z-10">{children}</span>
    </>
  );
}

function normalizeToken(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function parseOrderStatusPayload(payload: unknown): OrderStatusModel | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  if (root.success !== true) return null;

  const orderRaw = root.order;
  if (!orderRaw || typeof orderRaw !== 'object') return null;

  const order = orderRaw as Record<string, unknown>;

  if (typeof order.id !== 'string' || !order.id.trim()) return null;
  if (order.currency !== 'UAH') return null;
  if (
    typeof order.totalAmountMinor !== 'number' ||
    !Number.isFinite(order.totalAmountMinor)
  ) {
    return null;
  }
  if (typeof order.paymentStatus !== 'string' || !order.paymentStatus.trim()) {
    return null;
  }

  const items = Array.isArray(order.items) ? order.items : [];
  const itemsCount = items.reduce((sum, item) => {
    if (!item || typeof item !== 'object') return sum;
    const q = (item as Record<string, unknown>).quantity;
    return typeof q === 'number' && Number.isFinite(q) ? sum + q : sum;
  }, 0);

  return {
    id: order.id,
    currency: order.currency,
    totalAmountMinor: order.totalAmountMinor,
    paymentStatus: order.paymentStatus,
    itemsCount,
  };
}

function getStatusCode(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'INTERNAL_ERROR';
  const code = (payload as Record<string, unknown>).code;
  return typeof code === 'string' && code.trim()
    ? code.trim()
    : 'INTERNAL_ERROR';
}

async function fetchOrderStatus(args: {
  orderId: string;
  statusToken: string | null;
}): Promise<StatusResult> {
  try {
    const qp = new URLSearchParams();
    if (args.statusToken) {
      qp.set('statusToken', args.statusToken);
    }

    const query = qp.toString();
    const endpoint = `/api/shop/orders/${encodeURIComponent(args.orderId)}/status${
      query ? `?${query}` : ''
    }`;

    const response = await fetch(endpoint, {
      method: 'GET',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-store' },
      credentials: 'same-origin',
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { ok: false, code: getStatusCode(body) };
    }

    const order = parseOrderStatusPayload(body);
    if (!order) return { ok: false, code: 'INVALID_STATUS_RESPONSE' };

    return { ok: true, order };
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR' };
  }
}

function getStorageKey(orderId: string) {
  return `${STATUS_TOKEN_KEY_PREFIX}${orderId}`;
}

function readStatusToken(orderId: string): string | null {
  try {
    return normalizeToken(sessionStorage.getItem(getStorageKey(orderId)));
  } catch {
    return null;
  }
}

function writeStatusToken(orderId: string, token: string): void {
  try {
    sessionStorage.setItem(getStorageKey(orderId), token);
  } catch {
    // Best effort only: browser/session settings may block storage.
  }
}

function resolveStatusErrorMessage(code: string, fallback: string) {
  if (code === 'ORDER_NOT_FOUND') return 'errors.orderNotFound';
  if (POLL_STOP_ERROR_CODES.has(code)) return 'success.statusAccessDenied';
  return fallback;
}

function getBackoffDelayMs(attemptCount: number) {
  const exponent = Math.max(attemptCount - 1, 0);
  return Math.min(POLL_BASE_DELAY_MS * 2 ** exponent, POLL_MAX_DELAY_MS);
}

function isTerminalPaymentStatus(status: string): boolean {
  return !POLL_ACTIVE_STATUSES.has(status as PaymentStatus);
}

function mapPaymentStatusToUi(status: PaymentStatus | string): StatusUiViewModel {
  if (status === 'pending' || status === 'requires_payment') {
    return {
      uiState: 'pending',
      headlineKey: 'success.statusHeadlines.pending',
      messageKey: 'success.statusMessages.pending',
      isTerminal: false,
    };
  }

  if (status === 'paid') {
    return {
      uiState: 'paid',
      headlineKey: 'success.statusHeadlines.paid',
      messageKey: 'success.statusMessages.paid',
      isTerminal: true,
    };
  }

  if (status === 'needs_review') {
    return {
      uiState: 'needs_review',
      headlineKey: 'success.statusHeadlines.needsReview',
      messageKey: 'success.statusMessages.needsReview',
      isTerminal: true,
    };
  }

  if (status === 'failed' || status === 'refunded' || status === 'canceled') {
    return {
      uiState: 'canceled',
      headlineKey: 'success.statusHeadlines.canceled',
      messageKey: 'success.statusMessages.canceled',
      isTerminal: true,
    };
  }

  return {
    uiState: 'pending',
    headlineKey: 'success.statusHeadlines.pending',
    messageKey: 'success.statusMessages.pendingUnknown',
    isTerminal: false,
  };
}

export default function MonobankRedirectStatus({
  orderId,
  locale,
  initialStatusToken,
  paymentsDisabled,
}: Props) {
  const router = useRouter();
  const t = useTranslations('shop.checkout');
  const [order, setOrder] = useState<OrderStatusModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusCode, setStatusCode] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const tokenRef = useRef<string | null>(null);
  const requestSeqRef = useRef(0);
  const initializedOrderIdRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const pollTimerRef = useRef<number | null>(null);
  const pollAttemptsRef = useRef(0);
  const pollStartedAtRef = useRef<number | null>(null);

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const resetPollWindow = useCallback(() => {
    pollAttemptsRef.current = 0;
    pollStartedAtRef.current = Date.now();
  }, []);

  const hasPollingBudget = useCallback(() => {
    if (pollAttemptsRef.current >= POLL_MAX_ATTEMPTS) return false;
    const startedAt = pollStartedAtRef.current;
    if (startedAt === null) return true;
    return Date.now() - startedAt < POLL_MAX_DURATION_MS;
  }, []);

  const refreshStatus = useCallback(
    async (tokenOverride?: string | null): Promise<RefreshOutcome | null> => {
      if (inFlightRef.current) return null;
      inFlightRef.current = true;

      const seq = ++requestSeqRef.current;
      pollAttemptsRef.current += 1;

      setIsLoading(true);
      setStatusCode(null);

      const token = normalizeToken(tokenOverride ?? tokenRef.current);
      try {
        const result = await fetchOrderStatus({
          orderId,
          statusToken: token,
        });

        if (seq !== requestSeqRef.current) return null;

        let outcome: RefreshOutcome;
        if (result.ok) {
          setOrder(result.order);
          setStatusCode(null);
          outcome = {
            kind: 'order',
            paymentStatus: result.order.paymentStatus,
          };
        } else {
          setStatusCode(result.code);
          outcome = { kind: 'error', code: result.code };
        }

        setHasLoadedOnce(true);
        setIsLoading(false);
        return outcome;
      } finally {
        inFlightRef.current = false;
      }
    },
    [orderId]
  );

  const runPollingCycle = useCallback(async () => {
    if (paymentsDisabled) {
      clearPollTimer();
      return;
    }

    if (!hasPollingBudget()) {
      clearPollTimer();
      return;
    }

    if (inFlightRef.current) {
      clearPollTimer();
      pollTimerRef.current = window.setTimeout(() => {
        void runPollingCycle();
      }, POLL_BUSY_RETRY_DELAY_MS);
      return;
    }

    const outcome = await refreshStatus();
    if (!outcome) return;

    if (outcome.kind === 'order' && isTerminalPaymentStatus(outcome.paymentStatus)) {
      clearPollTimer();
      return;
    }

    if (outcome.kind === 'error' && POLL_STOP_ERROR_CODES.has(outcome.code)) {
      clearPollTimer();
      return;
    }

    if (!hasPollingBudget()) {
      clearPollTimer();
      return;
    }

    const delayMs = getBackoffDelayMs(pollAttemptsRef.current);
    clearPollTimer();
    pollTimerRef.current = window.setTimeout(() => {
      void runPollingCycle();
    }, delayMs);
  }, [clearPollTimer, hasPollingBudget, paymentsDisabled, refreshStatus]);

  const restartPolling = useCallback(() => {
    if (paymentsDisabled) return;
    if (order && isTerminalPaymentStatus(order.paymentStatus)) return;
    if (statusCode && POLL_STOP_ERROR_CODES.has(statusCode)) return;
    clearPollTimer();
    resetPollWindow();
    pollTimerRef.current = window.setTimeout(() => {
      void runPollingCycle();
    }, 0);
  }, [
    clearPollTimer,
    order,
    paymentsDisabled,
    resetPollWindow,
    runPollingCycle,
    statusCode,
  ]);

  useEffect(() => {
    if (initializedOrderIdRef.current === orderId) return;
    initializedOrderIdRef.current = orderId;

    const queryToken = normalizeToken(initialStatusToken);
    const storedToken = readStatusToken(orderId);
    const tokenForStatus = queryToken ?? storedToken;

    if (queryToken) {
      writeStatusToken(orderId, queryToken);

      try {
        const currentUrl = new URL(window.location.href);
        if (currentUrl.searchParams.has('statusToken')) {
          currentUrl.searchParams.delete('statusToken');
          const nextSearch = currentUrl.searchParams.toString();
          const nextUrl = nextSearch
            ? `${currentUrl.pathname}?${nextSearch}`
            : currentUrl.pathname;
          router.replace(nextUrl, { scroll: false });
        }
      } catch {
        // Best effort only.
      }
    }

    tokenRef.current = tokenForStatus;
    clearPollTimer();
    resetPollWindow();
    pollTimerRef.current = window.setTimeout(() => {
      void runPollingCycle();
    }, 0);

    return () => {
      clearPollTimer();
      requestSeqRef.current += 1;
    };
  }, [
    clearPollTimer,
    initialStatusToken,
    orderId,
    resetPollWindow,
    router,
    runPollingCycle,
  ]);

  const paymentStatus = order?.paymentStatus ?? 'pending';
  const statusVm = useMemo(
    () => mapPaymentStatusToUi(paymentStatus),
    [paymentStatus]
  );
  const statusHeadline = isLoading
    ? t('success.statusHeadlines.pending')
    : t(statusVm.headlineKey);
  const statusMessage = isLoading
    ? t('success.statusMessages.pending')
    : t(statusVm.messageKey);

  const errorText = useMemo(() => {
    if (!statusCode) return null;
    return t(resolveStatusErrorMessage(statusCode, 'errors.tryAgainLater'));
  }, [statusCode, t]);

  return (
    <section className="border-border bg-card rounded-lg border p-8">
      <p className="text-accent text-sm font-semibold tracking-wide uppercase">
        {t('success.title')}
      </p>

      <h1 id="order-title" className="text-foreground mt-2 text-3xl font-bold">
        {t('success.orderLabel')} #{orderId}
      </h1>

      <p
        className="text-muted-foreground mt-2 text-sm font-medium"
        role="status"
        aria-live="polite"
      >
        {statusHeadline}
      </p>
      <p className="text-muted-foreground mt-2 text-sm">{statusMessage}</p>

      {statusVm.uiState === 'needs_review' ? (
        <p className="mt-3 text-sm text-amber-500" role="note">
          {t('success.needsReviewContact', { orderId })}
        </p>
      ) : null}

      {paymentsDisabled ? (
        <p className="mt-3 text-sm text-amber-500" role="note">
          {t('success.paymentsDisabled')}
        </p>
      ) : null}

      {errorText ? (
        <p className="mt-3 text-sm text-amber-500" role="status" aria-live="polite">
          {errorText}
        </p>
      ) : null}

      <section
        className="mt-6 grid gap-6 md:grid-cols-2"
        aria-label="Order summary"
      >
        <div className="border-border bg-muted/40 rounded-md border p-4">
          <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
            {t('success.orderSummary')}
          </h2>

          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">{t('success.totalAmount')}</dt>
              <dd className="text-foreground font-semibold">
                {order
                  ? formatMoneyCode(order.totalAmountMinor, order.currency, locale)
                  : '...'}
              </dd>
            </div>

            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">{t('success.items')}</dt>
              <dd className="text-foreground font-medium">
                {order ? order.itemsCount : '...'}
              </dd>
            </div>

            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">{t('success.status')}</dt>
              <dd className="text-foreground font-semibold capitalize">
                {paymentStatus}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <nav className="mt-8 flex flex-wrap gap-3" aria-label="Next steps">
        <button
          type="button"
          onClick={restartPolling}
          className={SHOP_OUTLINE_BTN}
          aria-busy={isLoading}
        >
          {isLoading && hasLoadedOnce
            ? t('success.refreshingStatus')
            : t('success.refreshStatus')}
        </button>

        <Link href="/shop/products" className={SHOP_HERO_CTA_SM}>
          <HeroCtaInner>{t('success.continueShopping')}</HeroCtaInner>
        </Link>

        <Link href="/shop/cart" className={SHOP_OUTLINE_BTN}>
          {t('success.viewCart')}
        </Link>
      </nav>
    </section>
  );
}
