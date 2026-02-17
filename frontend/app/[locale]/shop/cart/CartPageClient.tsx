'use client';

import { Loader2, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { Loader } from '@/components/shared/Loader';
import { useCart } from '@/components/shop/CartProvider';
import { Link, useRouter } from '@/i18n/routing';
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
            setOrdersSummary({ count: 0, latestOrderId: null });
          }
          return;
        }

        const data: unknown = await res.json().catch(() => null);
        if (!res.ok || !data || typeof data !== 'object') return;

        const maybe = data as { success?: unknown; orders?: unknown };
        if (maybe.success !== true || !Array.isArray(maybe.orders)) return;

        const orders = maybe.orders as Array<{ id?: unknown }>;
        const count = orders.length;
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

    setCheckoutError(null);
    setCreatedOrderId(null);
    setIsCheckingOut(true);

    try {
      const idempotencyKey = generateIdempotencyKey();

      const response = await fetch('/api/shop/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          paymentProvider: selectedProvider,
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

  if (!isClientReady) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader size={160} className="opacity-90" />
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
              <span className="text-muted-foreground">
                {t('summary.shippingCalc')}
              </span>
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
          </div>

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
              disabled={isCheckingOut || !hasSelectableProvider}
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
