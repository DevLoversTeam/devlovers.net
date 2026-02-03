'use client';

import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

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

export default function CartPage() {
  const { cart, updateQuantity, removeFromCart } = useCart();
  const router = useRouter();
  const t = useTranslations('shop.cart');
  const tColors = useTranslations('shop.catalog.colors');
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  const params = useParams<{ locale?: string }>();
  const locale = params.locale ?? 'en';
  const shopBase = '/shop';

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
              : 'Unable to start checkout right now.';
        setCheckoutError(message);
        return;
      }

      if (!data?.orderId) {
        setCheckoutError('Unexpected checkout response.');
        return;
      }

      const paymentProvider: string = data.paymentProvider ?? 'none';
      const clientSecret: string | null =
        typeof data.clientSecret === 'string' &&
        data.clientSecret.trim().length > 0
          ? data.clientSecret
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
      setCheckoutError('Unable to start checkout right now.');
    } finally {
      setIsCheckingOut(false);
    }
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

          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={handleCheckout}
              disabled={isCheckingOut}
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

              <span className="relative z-10">
                {isCheckingOut
                  ? t('checkout.placing')
                  : t('checkout.placeOrder')}
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
