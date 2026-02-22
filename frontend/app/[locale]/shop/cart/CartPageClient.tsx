'use client';

import { Loader2, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { Loader } from '@/components/shared/Loader';
import { useCart } from '@/components/shop/CartProvider';
import { Link, useRouter } from '@/i18n/routing';
import {
  buildCheckoutShippingPayload,
  countryFromLocale,
  shippingUnavailableMessage,
  type CheckoutDeliveryMethodCode,
  type ShippingUnavailableReasonCode,
} from '@/lib/services/shop/shipping/checkout-payload';
import { formatMoney } from '@/lib/shop/currency';
import { generateIdempotencyKey } from '@/lib/shop/idempotency';
import {
  SHOP_CHIP_BORDER_HOVER,
  SHOP_CHIP_INTERACTIVE,
  SHOP_CHIP_SHADOW_HOVER,
  SHOP_CTA_BASE,
  SHOP_CTA_INSET,
  SHOP_CTA_INTERACTIVE,
  SHOP_CTA_WAVE,
  SHOP_DISABLED,
  SHOP_FOCUS,
  SHOP_LINK_BASE,
  SHOP_LINK_MD,
  SHOP_LINK_XS,
  SHOP_STEPPER_BUTTON_BASE,
  shopCtaGradient,
} from '@/lib/shop/ui-classes';
import { cn } from '@/lib/utils';

const SHOP_PRODUCT_LINK = cn(
  'block truncate',
  SHOP_LINK_BASE,
  SHOP_LINK_MD,
  SHOP_FOCUS
);

const SHOP_STEPPER_BTN = cn(
  SHOP_STEPPER_BUTTON_BASE,
  'h-8 w-8',
  SHOP_CHIP_INTERACTIVE,
  SHOP_CHIP_SHADOW_HOVER,
  SHOP_CHIP_BORDER_HOVER,
  SHOP_FOCUS,
  SHOP_DISABLED
);

const SHOP_HERO_CTA = cn(
  SHOP_CTA_BASE,
  SHOP_CTA_INTERACTIVE,
  SHOP_FOCUS,
  SHOP_DISABLED,
  'w-full justify-center gap-2 px-6 py-3 text-sm text-white',
  'shadow-[var(--shop-hero-btn-shadow)] hover:shadow-[var(--shop-hero-btn-shadow-hover)]'
);

const ORDERS_LINK = cn(SHOP_LINK_BASE, SHOP_LINK_MD, SHOP_FOCUS);

const ORDERS_COUNT_BADGE = cn(
  'border-border bg-muted/40 text-foreground inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums'
);

const ORDERS_CARD = cn('border-border rounded-md border p-4');

type Props = {
  stripeEnabled: boolean;
  monobankEnabled: boolean;
};

type CheckoutProvider = 'stripe' | 'monobank';

function resolveInitialProvider(args: {
  stripeEnabled: boolean;
  monobankEnabled: boolean;
  currency: string | null | undefined;
}): CheckoutProvider {
  const isUah = args.currency === 'UAH';
  const canUseStripe = args.stripeEnabled;
  const canUseMonobank = args.monobankEnabled && isUah;

  if (canUseStripe) return 'stripe';
  if (canUseMonobank) return 'monobank';
  return 'stripe';
}

type OrdersSummaryState = {
  count: number;
  latestOrderId: string | null;
};

type ShippingMethod = {
  provider: 'nova_poshta';
  methodCode: CheckoutDeliveryMethodCode;
  title: string;
};

type ShippingCity = {
  ref: string;
  nameUa: string;
};

type ShippingWarehouse = {
  ref: string;
  name: string;
  address: string | null;
};

function isWarehouseMethod(methodCode: CheckoutDeliveryMethodCode | null): boolean {
  return methodCode === 'NP_WAREHOUSE' || methodCode === 'NP_LOCKER';
}

export default function CartPage({ stripeEnabled, monobankEnabled }: Props) {
  const { cart, updateQuantity, removeFromCart } = useCart();
  const router = useRouter();
  const t = useTranslations('shop.cart');
  const tOrders = useTranslations('shop.orders');
  const tColors = useTranslations('shop.catalog.colors');

  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  const [ordersSummary, setOrdersSummary] = useState<OrdersSummaryState | null>(
    null
  );
  const [isOrdersLoading, setIsOrdersLoading] = useState(false);

  const [selectedProvider, setSelectedProvider] = useState<CheckoutProvider>(
    () =>
      resolveInitialProvider({
        stripeEnabled,
        monobankEnabled,
        currency: cart?.summary?.currency,
      })
  );
  const [isClientReady, setIsClientReady] = useState(false);
  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([]);
  const [shippingMethodsLoading, setShippingMethodsLoading] = useState(false);
  const [shippingAvailable, setShippingAvailable] = useState(false);
  const [shippingReasonCode, setShippingReasonCode] =
    useState<ShippingUnavailableReasonCode | null>(null);
  const [selectedShippingMethod, setSelectedShippingMethod] =
    useState<CheckoutDeliveryMethodCode | null>(null);

  const [cityQuery, setCityQuery] = useState('');
  const [cityOptions, setCityOptions] = useState<ShippingCity[]>([]);
  const [selectedCityRef, setSelectedCityRef] = useState<string | null>(null);
  const [selectedCityName, setSelectedCityName] = useState<string | null>(null);
  const [citiesLoading, setCitiesLoading] = useState(false);

  const [warehouseQuery, setWarehouseQuery] = useState('');
  const [warehouseOptions, setWarehouseOptions] = useState<ShippingWarehouse[]>(
    []
  );
  const [selectedWarehouseRef, setSelectedWarehouseRef] = useState<
    string | null
  >(null);
  const [selectedWarehouseName, setSelectedWarehouseName] = useState<
    string | null
  >(null);
  const [warehousesLoading, setWarehousesLoading] = useState(false);

  const [courierAddressLine1, setCourierAddressLine1] = useState('');
  const [courierAddressLine2, setCourierAddressLine2] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientComment, setRecipientComment] = useState('');

  const [deliveryUiError, setDeliveryUiError] = useState<string | null>(null);

  useEffect(() => {
    setIsClientReady(true);
  }, []);

  const params = useParams<{ locale?: string }>();
  const locale = params.locale ?? 'en';
  const shopBase = '/shop';
  const isUahCheckout = cart.summary.currency === 'UAH';
  const canUseStripe = stripeEnabled;
  const canUseMonobank = monobankEnabled && isUahCheckout;
  const hasSelectableProvider = canUseStripe || canUseMonobank;
  const country = countryFromLocale(locale);
  const shippingUnavailableHardBlock =
    shippingReasonCode === 'COUNTRY_NOT_SUPPORTED' ||
    shippingReasonCode === 'CURRENCY_NOT_SUPPORTED' ||
    shippingReasonCode === 'INTERNAL_ERROR';
  const isWarehouseSelectionMethod = isWarehouseMethod(selectedShippingMethod);

  useEffect(() => {
    if (selectedProvider === 'stripe' && !canUseStripe && canUseMonobank) {
      setSelectedProvider('monobank');
      return;
    }
    if (selectedProvider === 'monobank' && !canUseMonobank && canUseStripe) {
      setSelectedProvider('stripe');
    }
  }, [canUseMonobank, canUseStripe, selectedProvider]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadShippingMethods() {
      setShippingMethodsLoading(true);
      setDeliveryUiError(null);

      try {
        const qs = new URLSearchParams({
          locale,
          currency: cart.summary.currency,
          ...(country ? { country } : {}),
        });

        const response = await fetch(`/api/shop/shipping/methods?${qs}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal: controller.signal,
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
          if (!cancelled) {
            setShippingAvailable(false);
            setShippingReasonCode('INTERNAL_ERROR');
            setShippingMethods([]);
          }
          return;
        }

        const available = data?.available === true;
        const reasonCode = (data?.reasonCode ?? null) as ShippingUnavailableReasonCode | null;
        const methods = Array.isArray(data?.methods)
          ? (data.methods as ShippingMethod[])
          : [];

        if (cancelled) return;

        setShippingAvailable(available);
        setShippingReasonCode(reasonCode);
        setShippingMethods(methods);

        if (!available || methods.length === 0) {
          setSelectedShippingMethod(null);
          return;
        }

        setSelectedShippingMethod(current => {
          if (current && methods.some(method => method.methodCode === current)) {
            return current;
          }
          return methods[0]!.methodCode;
        });
      } catch {
        if (!cancelled) {
          setShippingAvailable(false);
          setShippingReasonCode('INTERNAL_ERROR');
          setShippingMethods([]);
        }
      } finally {
        if (!cancelled) {
          setShippingMethodsLoading(false);
        }
      }
    }

    void loadShippingMethods();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [cart.summary.currency, country, locale]);

  useEffect(() => {
    setSelectedWarehouseRef(null);
    setSelectedWarehouseName(null);
    setWarehouseOptions([]);
    setWarehouseQuery('');
  }, [selectedCityRef, selectedShippingMethod]);

  useEffect(() => {
    if (!shippingAvailable) {
      setCityOptions([]);
      setCitiesLoading(false);
      return;
    }

    const query = cityQuery.trim();
    if (query.length < 2) {
      setCityOptions([]);
      setCitiesLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      setCitiesLoading(true);
      try {
        const qs = new URLSearchParams({
          q: query,
          locale,
          currency: cart.summary.currency,
          ...(country ? { country } : {}),
        });

        const response = await fetch(`/api/shop/shipping/np/cities?${qs}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal: controller.signal,
        });

        const data = await response.json().catch(() => null);

        if (!response.ok || !data || data.available === false) {
          if (!cancelled) {
            setCityOptions([]);
          }
          return;
        }

        if (!cancelled) {
          const next = Array.isArray(data.items)
            ? (data.items as ShippingCity[])
            : [];
          setCityOptions(next);
        }
      } catch {
        if (!cancelled) {
          setCityOptions([]);
        }
      } finally {
        if (!cancelled) {
          setCitiesLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [cart.summary.currency, cityQuery, country, locale, shippingAvailable]);

  useEffect(() => {
    if (!shippingAvailable || !selectedCityRef || !isWarehouseSelectionMethod) {
      setWarehouseOptions([]);
      setWarehousesLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      setWarehousesLoading(true);
      try {
        const qs = new URLSearchParams({
          cityRef: selectedCityRef,
          locale,
          currency: cart.summary.currency,
          ...(country ? { country } : {}),
          ...(warehouseQuery.trim().length > 0 ? { q: warehouseQuery.trim() } : {}),
        });

        const response = await fetch(
          `/api/shop/shipping/np/warehouses?${qs.toString()}`,
          {
            method: 'GET',
            headers: { Accept: 'application/json' },
            cache: 'no-store',
            signal: controller.signal,
          }
        );

        const data = await response.json().catch(() => null);

        if (!response.ok || !data || data.available === false) {
          if (!cancelled) {
            setWarehouseOptions([]);
          }
          return;
        }

        if (!cancelled) {
          const next = Array.isArray(data.items)
            ? (data.items as ShippingWarehouse[])
            : [];
          setWarehouseOptions(next);
        }
      } catch {
        if (!cancelled) {
          setWarehouseOptions([]);
        }
      } finally {
        if (!cancelled) {
          setWarehousesLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [
    cart.summary.currency,
    country,
    isWarehouseSelectionMethod,
    locale,
    selectedCityRef,
    shippingAvailable,
    warehouseQuery,
  ]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadOrdersSummary() {
      setIsOrdersLoading(true);

      const timeoutId = setTimeout(() => controller.abort(), 2500);

      try {
        const res = await fetch('/api/shop/orders', {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal: controller.signal,
        });

        if (res.status === 401 || res.status === 403) {
          if (!cancelled) {
            setOrdersSummary(null);
          }
          return;
        }

        const devWarn = (message: string, meta: Record<string, unknown>) => {
          if (process.env.NODE_ENV === 'production') return;

          const g = globalThis as unknown as {
            __DEVLOVERS_SHOP_DEBUG_LOGS__?: Array<{
              level: 'warn';
              message: string;
              meta: Record<string, unknown>;
              ts: number;
            }>;
          };

          if (!g.__DEVLOVERS_SHOP_DEBUG_LOGS__) {
            g.__DEVLOVERS_SHOP_DEBUG_LOGS__ = [];
          }

          g.__DEVLOVERS_SHOP_DEBUG_LOGS__.push({
            level: 'warn',
            message,
            meta,
            ts: Date.now(),
          });
        };

        let rawBody: string | null = null;
        let data: unknown = null;
        let parseError: unknown = null;

        try {
          rawBody = await res.text();
          if (rawBody && rawBody.trim().length > 0) {
            try {
              data = JSON.parse(rawBody) as unknown;
            } catch (err) {
              parseError = err;
              data = null;
            }
          }
        } catch (err) {
          parseError = err;
          data = null;
        }

        const bodyPreview = rawBody ? rawBody.slice(0, 500) : null;
        const parseErrorMessage =
          parseError instanceof Error
            ? parseError.message
            : parseError
              ? String(parseError)
              : null;

        if (!res.ok) {
          devWarn('[shop.cart] orders summary fetch non-OK', {
            status: res.status,
            statusText: res.statusText,
            bodyPreview,
            parseError: parseErrorMessage,
          });
          return;
        }

        if (!data || typeof data !== 'object') {
          devWarn('[shop.cart] orders summary fetch invalid JSON', {
            status: res.status,
            statusText: res.statusText,
            bodyType: data === null ? 'null' : typeof data,
            bodyPreview,
            parseError: parseErrorMessage,
          });
          return;
        }

        const maybe = data as {
          success?: unknown;
          orders?: unknown;
          totalCount?: unknown;
        };

        if (maybe.success !== true || !Array.isArray(maybe.orders)) {
          devWarn('[shop.cart] orders summary fetch unexpected shape', {
            status: res.status,
            statusText: res.statusText,
            bodyPreview,
          });
          return;
        }

        const orders = maybe.orders as Array<{ id?: unknown }>;

        const totalCountRaw = maybe.totalCount;
        const totalCountNum =
          typeof totalCountRaw === 'number'
            ? totalCountRaw
            : typeof totalCountRaw === 'string'
              ? Number(totalCountRaw)
              : typeof totalCountRaw === 'bigint'
                ? Number(totalCountRaw)
                : NaN;

        const count = Number.isFinite(totalCountNum)
          ? Math.max(0, Math.trunc(totalCountNum))
          : orders.length;

        const latestOrderId =
          typeof orders[0]?.id === 'string' ? orders[0].id : null;

        if (!cancelled) {
          setOrdersSummary({ count, latestOrderId });
        }
      } catch {
        // ignore (timeout/network) — we just don't show summary
      } finally {
        clearTimeout(timeoutId);
        if (!cancelled) {
          setIsOrdersLoading(false);
        }
      }
    }

    void loadOrdersSummary();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const translateColor = (color: string | null | undefined): string | null => {
    if (!color) return null;
    const colorSlug = color.toLowerCase();
    try {
      return tColors(colorSlug);
    } catch {
      return color;
    }
  };

  async function handleCheckout() {
    if (!hasSelectableProvider) {
      setCheckoutError(t('checkout.paymentMethod.noAvailable'));
      return;
    }
    if (selectedProvider === 'stripe' && !canUseStripe) {
      setCheckoutError(t('checkout.paymentMethod.noAvailable'));
      return;
    }
    if (selectedProvider === 'monobank' && !canUseMonobank) {
      setCheckoutError(
        monobankEnabled
          ? t('checkout.paymentMethod.monobankUahOnlyHint')
          : t('checkout.paymentMethod.monobankUnavailable')
      );
      return;
    }
    if (shippingUnavailableHardBlock) {
      setCheckoutError(shippingUnavailableMessage(shippingReasonCode));
      return;
    }

    setCheckoutError(null);
    setDeliveryUiError(null);
    setCreatedOrderId(null);
    setIsCheckingOut(true);

    try {
      const shippingPayloadResult = shippingAvailable
        ? buildCheckoutShippingPayload({
            shippingAvailable,
            reasonCode: shippingReasonCode,
            locale,
            methodCode: selectedShippingMethod,
            cityRef: selectedCityRef,
            warehouseRef: selectedWarehouseRef,
            addressLine1: courierAddressLine1,
            addressLine2: courierAddressLine2,
            recipientFullName: recipientName,
            recipientPhone: recipientPhone,
            recipientEmail,
            recipientComment,
          })
        : null;

      if (shippingPayloadResult && !shippingPayloadResult.ok) {
        setDeliveryUiError(shippingPayloadResult.message);
        setCheckoutError(shippingPayloadResult.message);
        return;
      }

      const idempotencyKey = generateIdempotencyKey();

      const response = await fetch('/api/shop/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          paymentProvider: selectedProvider,
          ...(shippingPayloadResult?.ok
            ? {
                shipping: shippingPayloadResult.shipping,
                ...(shippingPayloadResult.country
                  ? { country: shippingPayloadResult.country }
                  : {}),
              }
            : {}),
          items: cart.items.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
            selectedSize: item.selectedSize,
            selectedColor: item.selectedColor,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const message =
          typeof data?.message === 'string'
            ? data.message
            : typeof data?.error === 'string'
              ? data.error
              : t('checkout.errors.startFailed');
        setCheckoutError(message);
        return;
      }

      if (!data?.orderId) {
        setCheckoutError(t('checkout.errors.unexpectedResponse'));
        return;
      }

      const paymentProvider: string = data.paymentProvider ?? 'none';
      const clientSecret: string | null =
        typeof data.clientSecret === 'string' &&
        data.clientSecret.trim().length > 0
          ? data.clientSecret
          : null;
      const monobankPageUrl: string | null =
        typeof data.pageUrl === 'string' && data.pageUrl.trim().length > 0
          ? data.pageUrl
          : null;

      const orderId = String(data.orderId);
      setCreatedOrderId(orderId);

      if (paymentProvider === 'stripe' && clientSecret) {
        router.push(
          `${shopBase}/checkout/payment/${encodeURIComponent(
            orderId
          )}?clientSecret=${encodeURIComponent(clientSecret)}&clearCart=1`
        );
        return;
      }
      if (paymentProvider === 'monobank' && monobankPageUrl) {
        window.location.assign(monobankPageUrl);
        return;
      }
      if (paymentProvider === 'monobank' && !monobankPageUrl) {
        setCheckoutError(t('checkout.errors.unexpectedResponse'));
        return;
      }

      const paymentsDisabledFlag =
        paymentProvider !== 'stripe' || !clientSecret
          ? '&paymentsDisabled=true'
          : '';

      router.push(
        `${shopBase}/checkout/success?orderId=${encodeURIComponent(
          orderId
        )}&clearCart=1${paymentsDisabledFlag}`
      );
    } catch {
      setCheckoutError(t('checkout.errors.startFailed'));
    } finally {
      setIsCheckingOut(false);
    }
  }

  const shippingUnavailableText =
    shippingReasonCode && shippingReasonCode !== 'OK'
      ? shippingUnavailableMessage(shippingReasonCode)
      : null;
  const canPlaceOrder =
    hasSelectableProvider &&
    !shippingMethodsLoading &&
    !shippingUnavailableHardBlock &&
    (!shippingAvailable || !!selectedShippingMethod);

  const ordersCard = ordersSummary ? (
    <div className={ORDERS_CARD}>
      <div className="flex items-center justify-between gap-3">
        <Link href="/shop/orders" className={ORDERS_LINK}>
          {tOrders('title')}
        </Link>

        {isOrdersLoading ? (
          <Loader2
            className="text-muted-foreground h-4 w-4 animate-spin"
            aria-hidden="true"
          />
        ) : (
          <span className={ORDERS_COUNT_BADGE} aria-live="polite">
            {ordersSummary.count}
          </span>
        )}
      </div>

      <p className="text-muted-foreground mt-2 text-xs">
        {tOrders('subtitle')}
      </p>

      {ordersSummary.latestOrderId ? (
        <div className="mt-2">
          <Link
            href={`/shop/orders/${encodeURIComponent(ordersSummary.latestOrderId)}`}
            className={cn(SHOP_LINK_BASE, SHOP_LINK_XS, SHOP_FOCUS)}
          >
            {t('checkout.goToOrder')}
          </Link>
        </div>
      ) : null}
    </div>
  ) : null;
  const loadingAnnouncement = (() => {
    try {
      return t('loading');
    } catch {
      return 'Loading…';
    }
  })();

  if (!isClientReady) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader size={160} className="opacity-90" />
          <span className="sr-only" role="status" aria-live="polite">
            {loadingAnnouncement}
          </span>
        </div>
      </main>
    );
  }

  if (cart.items.length === 0) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-center text-center">
          <ShoppingBag
            className="text-muted-foreground h-16 w-16"
            aria-hidden="true"
          />
          <h1 className="text-foreground mt-6 text-3xl font-bold tracking-tight">
            {t('empty')}
          </h1>
          <p className="text-muted-foreground mt-4">{t('emptyDescription')}</p>

          <div className="mx-auto mt-8 w-full max-w-md">
            <Link href="/shop/products" className={SHOP_HERO_CTA}>
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
              <span className="relative z-10">{t('startShopping')}</span>
            </Link>

            {ordersCard ? <div className="mt-6">{ordersCard}</div> : null}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-foreground text-3xl font-bold tracking-tight">
        {t('title')}
      </h1>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        <section aria-label={t('itemsLabel')}>
          <ul className="space-y-4">
            {cart.removed.length > 0 && (
              <li
                className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
                role="status"
                aria-live="polite"
              >
                {t('alerts.itemsRemoved')}
              </li>
            )}

            {cart.items.map(item => (
              <li
                key={`${item.productId}-${item.selectedSize ?? 'na'}-${item.selectedColor ?? 'na'}`}
                className="border-border rounded-lg border p-4"
              >
                <article className="flex gap-4">
                  <div className="bg-muted relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-md">
                    <Image
                      src={item.imageUrl || '/placeholder.svg'}
                      alt={item.title}
                      fill
                      className="object-cover"
                      sizes="96px"
                    />
                  </div>

                  <div className="flex flex-1 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/shop/products/${item.slug}`}
                          className={SHOP_PRODUCT_LINK}
                        >
                          {item.title}
                        </Link>

                        {(item.selectedSize || item.selectedColor) && (
                          <p className="text-muted-foreground mt-1 text-xs">
                            {[
                              translateColor(item.selectedColor),
                              item.selectedSize,
                            ]
                              .filter(Boolean)
                              .join(' / ')}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          removeFromCart(
                            item.productId,
                            item.selectedSize,
                            item.selectedColor
                          )
                        }
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={t('actions.removeItem', {
                          title: item.title,
                        })}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="mt-auto flex items-center justify-between pt-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            updateQuantity(
                              item.productId,
                              item.quantity - 1,
                              item.selectedSize,
                              item.selectedColor
                            )
                          }
                          disabled={item.quantity <= 1}
                          className={SHOP_STEPPER_BTN}
                          aria-label={t('actions.decreaseQty')}
                        >
                          <Minus className="h-3 w-3" aria-hidden="true" />
                        </button>

                        <span className="w-8 text-center text-sm font-medium">
                          {item.quantity}
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            updateQuantity(
                              item.productId,
                              item.quantity + 1,
                              item.selectedSize,
                              item.selectedColor
                            )
                          }
                          disabled={item.quantity >= item.stock}
                          className={SHOP_STEPPER_BTN}
                          aria-label={t('actions.increaseQty')}
                        >
                          <Plus className="h-3 w-3" aria-hidden="true" />
                        </button>

                        {item.quantity >= item.stock && (
                          <span
                            className="text-muted-foreground ml-3 text-xs"
                            role="status"
                          >
                            {t('actions.maxStock', { stock: item.stock })}
                          </span>
                        )}
                      </div>

                      <span className="text-foreground text-sm font-semibold">
                        {formatMoney(
                          item.lineTotalMinor,
                          item.currency,
                          locale
                        )}
                      </span>
                    </div>
                  </div>
                </article>
              </li>
            ))}
          </ul>
          {ordersCard ? <div className="mt-6">{ordersCard}</div> : null}
        </section>

        <aside
          className="border-border h-fit rounded-lg border p-6"
          aria-labelledby="order-summary"
        >
          <h2
            id="order-summary"
            className="text-foreground text-lg font-semibold"
          >
            {t('summary.heading')}
          </h2>

          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t('summary.subtotal')}
              </span>
              <span className="text-foreground font-medium">
                {formatMoney(
                  cart.summary.totalAmountMinor,
                  cart.summary.currency,
                  locale
                )}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t('summary.shipping')}
              </span>
              <span className="text-muted-foreground">Informational only</span>
            </div>

            <div className="border-border border-t pt-4">
              <div className="flex items-center justify-between">
                <span className="text-foreground text-base font-semibold">
                  {t('summary.total')}
                </span>
                <span className="text-foreground text-lg font-bold">
                  {formatMoney(
                    cart.summary.totalAmountMinor,
                    cart.summary.currency,
                    locale
                  )}
                </span>
              </div>
            </div>

            <p className="text-muted-foreground text-xs">
              Доставка оплачується перевізнику при отриманні; зараз списуємо лише
              товари.
            </p>
          </div>

          <fieldset className="border-border mt-6 rounded-md border p-4">
            <legend className="text-foreground px-1 text-sm font-semibold">
              Delivery
            </legend>

            {shippingMethodsLoading ? (
              <p className="text-muted-foreground text-xs">Loading delivery methods...</p>
            ) : null}

            {!shippingMethodsLoading && !shippingAvailable ? (
              <p className="text-muted-foreground text-xs" role="status">
                {shippingUnavailableText ?? 'Shipping is unavailable right now.'}
              </p>
            ) : null}

            {shippingAvailable ? (
              <div className="mt-3 space-y-3">
                <div className="space-y-2">
                  {shippingMethods.map(method => (
                    <label
                      key={method.methodCode}
                      className="border-border flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2"
                    >
                      <input
                        type="radio"
                        name="delivery-method"
                        value={method.methodCode}
                        checked={selectedShippingMethod === method.methodCode}
                        onChange={() => setSelectedShippingMethod(method.methodCode)}
                        className="h-4 w-4"
                      />
                      <span className="text-sm font-medium">{method.title}</span>
                    </label>
                  ))}
                </div>

                <div className="space-y-2">
                  <label className="text-muted-foreground text-xs" htmlFor="shipping-city-search">
                    City
                  </label>
                  <input
                    id="shipping-city-search"
                    type="text"
                    value={cityQuery}
                    onChange={event => {
                      setCityQuery(event.target.value);
                      setSelectedCityRef(null);
                      setSelectedCityName(null);
                    }}
                    placeholder="Start typing city name (min 2 chars)"
                    className="border-border bg-background w-full rounded-md border px-3 py-2 text-sm"
                  />

                  {selectedCityRef ? (
                    <p className="text-muted-foreground text-xs">
                      Selected city: {selectedCityName ?? selectedCityRef}
                    </p>
                  ) : null}

                  {citiesLoading ? (
                    <p className="text-muted-foreground text-xs">Searching cities...</p>
                  ) : null}

                  {!citiesLoading && cityOptions.length > 0 ? (
                    <div className="max-h-36 space-y-1 overflow-auto rounded-md border p-2">
                      {cityOptions.map(city => (
                        <button
                          key={city.ref}
                          type="button"
                          onClick={() => {
                            setSelectedCityRef(city.ref);
                            setSelectedCityName(city.nameUa);
                            setCityQuery(city.nameUa);
                          }}
                          className="hover:bg-secondary block w-full rounded px-2 py-1 text-left text-xs"
                        >
                          {city.nameUa}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                {isWarehouseSelectionMethod ? (
                  <div className="space-y-2">
                    <label
                      className="text-muted-foreground text-xs"
                      htmlFor="shipping-warehouse-search"
                    >
                      Warehouse / parcel locker
                    </label>
                    <input
                      id="shipping-warehouse-search"
                      type="text"
                      value={warehouseQuery}
                      onChange={event => {
                        setWarehouseQuery(event.target.value);
                        setSelectedWarehouseRef(null);
                        setSelectedWarehouseName(null);
                      }}
                      placeholder="Type warehouse name or number"
                      className="border-border bg-background w-full rounded-md border px-3 py-2 text-sm"
                      disabled={!selectedCityRef}
                    />

                    {selectedWarehouseRef ? (
                      <p className="text-muted-foreground text-xs">
                        Selected warehouse: {selectedWarehouseName ?? selectedWarehouseRef}
                      </p>
                    ) : null}

                    {warehousesLoading ? (
                      <p className="text-muted-foreground text-xs">Searching warehouses...</p>
                    ) : null}

                    {!warehousesLoading && warehouseOptions.length > 0 ? (
                      <div className="max-h-36 space-y-1 overflow-auto rounded-md border p-2">
                        {warehouseOptions.map(warehouse => (
                          <button
                            key={warehouse.ref}
                            type="button"
                            onClick={() => {
                              setSelectedWarehouseRef(warehouse.ref);
                              setSelectedWarehouseName(warehouse.name);
                              setWarehouseQuery(
                                warehouse.address
                                  ? `${warehouse.name} (${warehouse.address})`
                                  : warehouse.name
                              );
                            }}
                            className="hover:bg-secondary block w-full rounded px-2 py-1 text-left text-xs"
                          >
                            {warehouse.name}
                            {warehouse.address ? `, ${warehouse.address}` : ''}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {selectedShippingMethod === 'NP_COURIER' ? (
                  <div className="space-y-2">
                    <label className="text-muted-foreground text-xs" htmlFor="shipping-address-1">
                      Courier address
                    </label>
                    <input
                      id="shipping-address-1"
                      type="text"
                      value={courierAddressLine1}
                      onChange={event => setCourierAddressLine1(event.target.value)}
                      placeholder="Street, house, apartment"
                      className="border-border bg-background w-full rounded-md border px-3 py-2 text-sm"
                    />
                    <input
                      type="text"
                      value={courierAddressLine2}
                      onChange={event => setCourierAddressLine2(event.target.value)}
                      placeholder="Additional address info (optional)"
                      className="border-border bg-background w-full rounded-md border px-3 py-2 text-sm"
                    />
                  </div>
                ) : null}

                <div className="space-y-2">
                  <label className="text-muted-foreground text-xs" htmlFor="recipient-name">
                    Recipient full name
                  </label>
                  <input
                    id="recipient-name"
                    type="text"
                    value={recipientName}
                    onChange={event => setRecipientName(event.target.value)}
                    placeholder="Full name"
                    className="border-border bg-background w-full rounded-md border px-3 py-2 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-muted-foreground text-xs" htmlFor="recipient-phone">
                    Recipient phone
                  </label>
                  <input
                    id="recipient-phone"
                    type="tel"
                    value={recipientPhone}
                    onChange={event => setRecipientPhone(event.target.value)}
                    placeholder="+380XXXXXXXXX or 0XXXXXXXXX"
                    className="border-border bg-background w-full rounded-md border px-3 py-2 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-muted-foreground text-xs" htmlFor="recipient-email">
                    Recipient email (optional)
                  </label>
                  <input
                    id="recipient-email"
                    type="email"
                    value={recipientEmail}
                    onChange={event => setRecipientEmail(event.target.value)}
                    placeholder="email@example.com"
                    className="border-border bg-background w-full rounded-md border px-3 py-2 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-muted-foreground text-xs" htmlFor="recipient-comment">
                    Comment (optional)
                  </label>
                  <textarea
                    id="recipient-comment"
                    value={recipientComment}
                    onChange={event => setRecipientComment(event.target.value)}
                    placeholder="Delivery comment"
                    rows={2}
                    className="border-border bg-background w-full rounded-md border px-3 py-2 text-sm"
                  />
                </div>

                {deliveryUiError ? (
                  <p className="text-destructive text-xs" role="alert">
                    {deliveryUiError}
                  </p>
                ) : null}
              </div>
            ) : null}
          </fieldset>

          <fieldset className="border-border mt-6 rounded-md border p-4">
            <legend className="text-foreground px-1 text-sm font-semibold">
              {t('checkout.paymentMethod.label')}
            </legend>

            <div className="mt-3 space-y-2">
              {canUseStripe ? (
                <label className="border-border flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2">
                  <input
                    type="radio"
                    name="payment-provider"
                    value="stripe"
                    checked={selectedProvider === 'stripe'}
                    onChange={() => setSelectedProvider('stripe')}
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-medium">
                    {t('checkout.paymentMethod.stripe')}
                  </span>
                </label>
              ) : null}

              <label
                className={cn(
                  'border-border flex items-center gap-2 rounded-md border px-3 py-2',
                  canUseMonobank ? 'cursor-pointer' : 'opacity-60'
                )}
              >
                <input
                  type="radio"
                  name="payment-provider"
                  value="monobank"
                  checked={selectedProvider === 'monobank'}
                  onChange={() => setSelectedProvider('monobank')}
                  disabled={!canUseMonobank}
                  className="h-4 w-4"
                />
                <span className="text-sm font-medium">
                  {t('checkout.paymentMethod.monobank')}
                </span>
              </label>

              {!canUseMonobank ? (
                <p className="text-muted-foreground text-xs">
                  {monobankEnabled
                    ? t('checkout.paymentMethod.monobankUahOnlyHint')
                    : t('checkout.paymentMethod.monobankUnavailable')}
                </p>
              ) : null}

              {!hasSelectableProvider ? (
                <p className="text-destructive text-xs" role="status">
                  {t('checkout.paymentMethod.noAvailable')}
                </p>
              ) : null}
            </div>
          </fieldset>

          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={handleCheckout}
              disabled={isCheckingOut || !canPlaceOrder}
              className={SHOP_HERO_CTA}
              aria-busy={isCheckingOut}
            >
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

              <span className="relative z-10 inline-flex min-w-0 items-center justify-center gap-2">
                {isCheckingOut ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : null}

                <span className="truncate whitespace-nowrap">
                  {t('checkout.placeOrder')}
                </span>

                {isCheckingOut ? (
                  <span className="sr-only">{t('checkout.placing')}</span>
                ) : null}
              </span>
            </button>

            <p className="text-muted-foreground text-center text-xs">
              {t('checkout.message')}
            </p>

            {createdOrderId && !checkoutError ? (
              <div className="flex justify-center">
                <Link
                  href={`/shop/orders/${encodeURIComponent(createdOrderId)}`}
                  className={cn(SHOP_LINK_BASE, SHOP_LINK_XS, SHOP_FOCUS)}
                >
                  {t('checkout.notRedirected')}
                </Link>
              </div>
            ) : null}

            {checkoutError ? (
              <div className="space-y-2">
                <p
                  className="text-destructive text-center text-xs"
                  role="alert"
                >
                  {checkoutError}
                </p>

                {createdOrderId ? (
                  <div className="flex justify-center">
                    <Link
                      href={`/shop/orders/${encodeURIComponent(createdOrderId)}`}
                      className={cn(SHOP_LINK_BASE, SHOP_LINK_XS, SHOP_FOCUS)}
                    >
                      {t('checkout.goToOrder')}
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </main>
  );
}
