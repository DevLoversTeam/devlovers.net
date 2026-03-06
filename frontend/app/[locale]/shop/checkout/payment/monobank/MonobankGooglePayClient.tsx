'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Link, useRouter } from '@/i18n/routing';
import { generateIdempotencyKey } from '@/lib/shop/idempotency';
import {
  SHOP_CTA_BASE,
  SHOP_CTA_INSET,
  SHOP_CTA_INTERACTIVE,
  SHOP_CTA_WAVE,
  SHOP_DISABLED,
  SHOP_FOCUS,
  SHOP_OUTLINE_BTN_BASE,
  SHOP_OUTLINE_BTN_INTERACTIVE,
  shopCtaGradient,
} from '@/lib/shop/ui-classes';
import { cn } from '@/lib/utils';

type MonobankGooglePayClientProps = {
  orderId: string;
  statusToken: string | null;
};

type GooglePayConfig = {
  paymentDataRequest: unknown;
  readinessHints?: {
    isReadyToPayRequest?: unknown;
  };
};

type GooglePayPaymentData = {
  paymentMethodData?: {
    tokenizationData?: {
      token?: unknown;
    };
  };
};

type GooglePayPaymentsClient = {
  createButton(options: {
    onClick: () => void;
    buttonType?: string;
    buttonColor?: string;
    buttonSizeMode?: string;
  }): HTMLElement;
  isReadyToPay(request: unknown): Promise<{ result: boolean }>;
  loadPaymentData(request: unknown): Promise<GooglePayPaymentData>;
};

type GooglePayPaymentsClientCtor = new (options: {
  environment: 'TEST' | 'PRODUCTION';
}) => GooglePayPaymentsClient;

declare global {
  interface Window {
    google?: {
      payments?: {
        api?: {
          PaymentsClient?: GooglePayPaymentsClientCtor;
        };
      };
    };
  }
}

const GOOGLE_PAY_SCRIPT_SRC = 'https://pay.google.com/gp/p/js/pay.js';

let googlePayScriptPromise: Promise<void> | null = null;

const SHOP_HERO_CTA = cn(
  SHOP_CTA_BASE,
  SHOP_CTA_INTERACTIVE,
  SHOP_FOCUS,
  SHOP_DISABLED,
  'w-full items-center justify-center gap-2 px-6 py-3 text-sm text-white',
  'shadow-[var(--shop-hero-btn-shadow)] hover:shadow-[var(--shop-hero-btn-shadow-hover)]'
);

const SHOP_OUTLINE_BTN = cn(
  SHOP_OUTLINE_BTN_BASE,
  SHOP_OUTLINE_BTN_INTERACTIVE,
  SHOP_FOCUS,
  SHOP_DISABLED
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

function loadGooglePayScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.payments?.api?.PaymentsClient) return Promise.resolve();
  if (googlePayScriptPromise) return googlePayScriptPromise;

  const promise: Promise<void> = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GOOGLE_PAY_SCRIPT_SRC}"]`
    );

    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => {
          googlePayScriptPromise = null;
          reject(new Error('google_pay_script_failed'));
        },
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.src = GOOGLE_PAY_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      googlePayScriptPromise = null;
      script.remove();
      reject(new Error('google_pay_script_failed'));
    };
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    googlePayScriptPromise = null;
    throw error;
  });

  googlePayScriptPromise = promise;
  return promise;
}

function normalizeToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function buildPendingReturnPath(orderId: string, statusToken: string | null) {
  const params = new URLSearchParams({ orderId });
  if (statusToken) params.set('statusToken', statusToken);
  params.set('clearCart', '1');
  return `/shop/checkout/return/monobank?${params.toString()}`;
}

function buildStatusTokenQuery(statusToken: string | null) {
  if (!statusToken) return '';
  return `?statusToken=${encodeURIComponent(statusToken)}`;
}

function extractGToken(payload: GooglePayPaymentData | null): string | null {
  return normalizeToken(payload?.paymentMethodData?.tokenizationData?.token);
}

function createPaymentsClient(): GooglePayPaymentsClient | null {
  const ctor = window.google?.payments?.api?.PaymentsClient;
  if (!ctor) return null;

  return new ctor({
    environment: process.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'TEST',
  });
}

export default function MonobankGooglePayClient({
  orderId,
  statusToken,
}: MonobankGooglePayClientProps) {
  const t = useTranslations('shop.checkout');
  const router = useRouter();

  const [isScriptReady, setIsScriptReady] = useState(false);
  const [config, setConfig] = useState<GooglePayConfig | null>(null);
  const [isConfigLoading, setIsConfigLoading] = useState(true);
  const [isReadyToPay, setIsReadyToPay] = useState(false);
  const [isCheckingReadiness, setIsCheckingReadiness] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isInvoiceSubmitting, setIsInvoiceSubmitting] = useState(false);
  const [uiMessage, setUiMessage] = useState<string | null>(null);
  const [uiMessageTone, setUiMessageTone] = useState<'error' | 'info'>('error');

  const paymentsClientRef = useRef<GooglePayPaymentsClient | null>(null);
  const buttonHostRef = useRef<HTMLDivElement | null>(null);
  const submitIdempotencyKeyRef = useRef<string | null>(null);
  const pendingRedirectTimeoutRef = useRef<number | null>(null);
  const pendingPath = buildPendingReturnPath(orderId, statusToken);
  const statusTokenQuery = buildStatusTokenQuery(statusToken);

  const goToPending = useCallback(() => {
    router.push(pendingPath);
  }, [pendingPath, router]);

  useEffect(() => {
    submitIdempotencyKeyRef.current = null;

    if (pendingRedirectTimeoutRef.current !== null) {
      window.clearTimeout(pendingRedirectTimeoutRef.current);
      pendingRedirectTimeoutRef.current = null;
    }
  }, [orderId]);

  useEffect(() => {
    return () => {
      if (pendingRedirectTimeoutRef.current !== null) {
        window.clearTimeout(pendingRedirectTimeoutRef.current);
        pendingRedirectTimeoutRef.current = null;
      }
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    void loadGooglePayScript()
      .then(() => {
        if (!cancelled) setIsScriptReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setIsScriptReady(false);
          setUiMessageTone('error');
          setUiMessage(t('monobankGooglePay.unableToInit'));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      setIsConfigLoading(true);

      try {
        const response = await fetch(
          `/api/shop/orders/${encodeURIComponent(
            orderId
          )}/payment/monobank/google-pay/config${statusTokenQuery}`,
          {
            method: 'GET',
            headers: { Accept: 'application/json' },
            cache: 'no-store',
          }
        );

        const data = (await response.json().catch(() => null)) as Record<
          string,
          unknown
        > | null;

        if (!response.ok || !data) {
          if (!cancelled) {
            setConfig(null);
            setUiMessageTone('error');
            setUiMessage(t('monobankGooglePay.unableToInit'));
          }
          return;
        }

        if (!cancelled) {
          setConfig({
            paymentDataRequest: data.paymentDataRequest,
            readinessHints:
              typeof data.readinessHints === 'object' && data.readinessHints
                ? (data.readinessHints as GooglePayConfig['readinessHints'])
                : undefined,
          });
        }
      } catch {
        if (!cancelled) {
          setConfig(null);
          setUiMessageTone('error');
          setUiMessage(t('monobankGooglePay.unableToInit'));
        }
      } finally {
        if (!cancelled) {
          setIsConfigLoading(false);
        }
      }
    }

    void loadConfig();

    return () => {
      cancelled = true;
    };
  }, [orderId, statusTokenQuery, t]);

  useEffect(() => {
    if (!isScriptReady || !config) {
      setIsCheckingReadiness(false);
      return;
    }

    let cancelled = false;
    setIsCheckingReadiness(true);

    const client = createPaymentsClient();
    paymentsClientRef.current = client;
    if (!client) {
      setIsCheckingReadiness(false);
      setIsReadyToPay(false);
      return;
    }

    const readinessRequest =
      config.readinessHints?.isReadyToPayRequest ?? config.paymentDataRequest;

    void client
      .isReadyToPay(readinessRequest)
      .then(result => {
        if (!cancelled) {
          setIsReadyToPay(Boolean(result?.result));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsReadyToPay(false);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsCheckingReadiness(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [config, isScriptReady]);

  const onGooglePayClick = useCallback(async () => {
    const client = paymentsClientRef.current;
    if (!client || !config) return;

    setUiMessage(null);
    setUiMessageTone('error');
    setIsSubmitting(true);

    try {
      const paymentData = await client.loadPaymentData(
        config.paymentDataRequest
      );
      const gToken = extractGToken(paymentData);
      if (!gToken) {
        submitIdempotencyKeyRef.current = null;
        setUiMessageTone('info');
        setUiMessage(t('monobankGooglePay.processingFallback'));

        if (pendingRedirectTimeoutRef.current !== null) {
          window.clearTimeout(pendingRedirectTimeoutRef.current);
        }

        pendingRedirectTimeoutRef.current = window.setTimeout(() => {
          pendingRedirectTimeoutRef.current = null;
          goToPending();
        }, 800);

        return;
      }

      submitIdempotencyKeyRef.current ??= generateIdempotencyKey();

      const response = await fetch(
        `/api/shop/orders/${encodeURIComponent(
          orderId
        )}/payment/monobank/google-pay/submit${statusTokenQuery}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': submitIdempotencyKeyRef.current,
          },
          body: JSON.stringify({ gToken }),
        }
      );

      const data = (await response.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      const redirectUrl =
        typeof data?.redirectUrl === 'string' &&
        data.redirectUrl.trim().length > 0
          ? data.redirectUrl
          : null;
      const returnUrl =
        typeof data?.returnUrl === 'string' && data.returnUrl.trim().length > 0
          ? data.returnUrl
          : null;

      if (response.ok) {
        if (redirectUrl) {
          window.location.assign(redirectUrl);
          return;
        }

        if (returnUrl) {
          window.location.assign(returnUrl);
          return;
        }

        goToPending();
        return;
      }

      setUiMessageTone('error');
      setUiMessage(t('monobankGooglePay.invoiceFallbackFailed'));
    } catch (error) {
      const statusCode =
        error && typeof error === 'object' && 'statusCode' in error
          ? String((error as { statusCode?: unknown }).statusCode ?? '')
          : '';

      if (statusCode === 'CANCELED') {
        submitIdempotencyKeyRef.current = null;
        setUiMessageTone('error');
        setUiMessage(t('monobankGooglePay.cancelled'));
        return;
      }

      setUiMessageTone('error');
      setUiMessage(t('monobankGooglePay.unableToInit'));
    } finally {
      setIsSubmitting(false);
    }
  }, [config, goToPending, orderId, statusTokenQuery, t]);

  useEffect(() => {
    if (!isReadyToPay || !paymentsClientRef.current || !buttonHostRef.current) {
      return;
    }

    const host = buttonHostRef.current;
    host.innerHTML = '';
    const button = paymentsClientRef.current.createButton({
      onClick: onGooglePayClick,
      buttonType: 'pay',
      buttonColor: 'black',
      buttonSizeMode: 'fill',
    });
    host.appendChild(button);

    return () => {
      host.innerHTML = '';
    };
  }, [isReadyToPay, onGooglePayClick]);

  const onInvoiceFallback = useCallback(async () => {
    submitIdempotencyKeyRef.current = null;
    setUiMessage(null);
    setUiMessageTone('error');
    setIsInvoiceSubmitting(true);

    try {
      const response = await fetch(
        `/api/shop/orders/${encodeURIComponent(
          orderId
        )}/payment/monobank/invoice${statusTokenQuery}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const data = (await response.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      const pageUrl =
        typeof data?.pageUrl === 'string' && data.pageUrl.trim().length > 0
          ? data.pageUrl
          : null;

      if (response.ok && pageUrl) {
        window.location.assign(pageUrl);
        return;
      }

      setUiMessageTone('error');
      setUiMessage(t('monobankGooglePay.invoiceFallbackFailed'));
    } catch {
      setUiMessageTone('error');
      setUiMessage(t('monobankGooglePay.invoiceFallbackFailed'));
    } finally {
      setIsInvoiceSubmitting(false);
    }
  }, [orderId, statusTokenQuery, t]);

  return (
    <section className="space-y-4" aria-label="Monobank Google Pay">
      <p className="text-muted-foreground text-sm">
        {t('monobankGooglePay.supportedDevices')}
      </p>

      <p className="text-muted-foreground text-xs">
        {t('monobankGooglePay.useInvoiceFallback')}
      </p>

      {isConfigLoading || isCheckingReadiness ? (
        <p className="text-muted-foreground text-sm" role="status">
          {t('monobankGooglePay.loading')}
        </p>
      ) : null}

      {isReadyToPay ? (
        <div className="space-y-3">
          <div ref={buttonHostRef} className="min-h-12" />
          <button
            type="button"
            className={SHOP_OUTLINE_BTN}
            onClick={onInvoiceFallback}
            disabled={isSubmitting || isInvoiceSubmitting}
          >
            {isInvoiceSubmitting
              ? t('monobankGooglePay.invoiceLoading')
              : t('monobankGooglePay.invoiceFallback')}
          </button>
        </div>
      ) : null}

      {!isConfigLoading && !isCheckingReadiness && !isReadyToPay ? (
        <div className="space-y-3">
          <button
            type="button"
            className={cn(SHOP_HERO_CTA, 'w-full sm:w-auto')}
            onClick={onInvoiceFallback}
            disabled={isInvoiceSubmitting}
          >
            <HeroCtaInner>
              {isInvoiceSubmitting
                ? t('monobankGooglePay.invoiceLoading')
                : t('monobankGooglePay.invoiceFallback')}
            </HeroCtaInner>
          </button>
        </div>
      ) : null}

      {isSubmitting ? (
        <p className="text-muted-foreground text-sm" role="status">
          {t('monobankGooglePay.submitting')}
        </p>
      ) : null}

      {uiMessage ? (
        <p
          className={cn(
            'text-sm',
            uiMessageTone === 'error'
              ? 'text-destructive'
              : 'text-muted-foreground'
          )}
          aria-live={uiMessageTone === 'error' ? 'assertive' : 'polite'}
        >
          {uiMessage}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Link href="/shop/cart" className={SHOP_OUTLINE_BTN}>
          {t('actions.backToCart')}
        </Link>
      </div>
    </section>
  );
}
