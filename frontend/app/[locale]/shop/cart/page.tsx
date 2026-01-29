'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';

import { Minus, Plus, Trash2, ShoppingBag } from 'lucide-react';

import { Link } from '@/i18n/routing';
import { useCart } from '@/components/shop/cart-provider';
import { generateIdempotencyKey } from '@/lib/shop/idempotency';
import { formatMoney } from '@/lib/shop/currency';

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

      const orderId: string = String(data.orderId);
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
            className="h-16 w-16 text-muted-foreground"
            aria-hidden="true"
          />
          <h1 className="mt-6 text-3xl font-bold tracking-tight text-foreground">
            {t('empty')}
          </h1>
          <p className="mt-4 text-muted-foreground">
            {t('emptyDescription')}
          </p>
          <Link
            href={`/shop/products`}
            className="mt-8 inline-flex items-center gap-2 rounded-md bg-accent px-6 py-3 text-sm font-semibold uppercase tracking-wide text-accent-foreground transition-colors hover:bg-accent/90"
          >
            {t('startShopping')}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">
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
                key={`${item.productId}-${item.selectedSize ?? 'na'}-${
                  item.selectedColor ?? 'na'
                }`}
                className="rounded-lg border border-border p-4"
              >
                <article className="flex gap-4">
                  <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-md bg-muted">
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
                          className="block truncate text-sm font-medium text-foreground hover:underline"
                        >
                          {item.title}
                        </Link>

                        {(item.selectedSize || item.selectedColor) && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {[translateColor(item.selectedColor), item.selectedSize]
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
                        className="text-muted-foreground transition-colors hover:text-foreground"
                        aria-label={t('actions.removeItem', { title: item.title })}
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
                          className="flex h-8 w-8 items-center justify-center rounded border border-border text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
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
                          className="flex h-8 w-8 items-center justify-center rounded border border-border text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
                          aria-label={t('actions.increaseQty')}
                        >
                          <Plus className="h-3 w-3" aria-hidden="true" />
                        </button>

                        {item.quantity >= item.stock && (
                          <span
                            className="ml-3 text-xs text-muted-foreground"
                            role="status"
                          >
                            {t('actions.maxStock', { stock: item.stock })}
                          </span>
                        )}
                      </div>

                      <span className="text-sm font-semibold text-foreground">
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
          className="h-fit rounded-lg border border-border p-6"
          aria-labelledby="order-summary"
        >
          <h2
            id="order-summary"
            className="text-lg font-semibold text-foreground"
          >
            {t('summary.heading')}
          </h2>

          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('summary.subtotal')}</span>
              <span className="font-medium text-foreground">
                {formatMoney(
                  cart.summary.totalAmountMinor,
                  cart.summary.currency,
                  locale
                )}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('summary.shipping')}</span>
              <span className="text-muted-foreground">
                {t('summary.shippingCalc')}
              </span>
            </div>

            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold text-foreground">
                  {t('summary.total')}
                </span>
                <span className="text-lg font-bold text-foreground">
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
              className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-6 py-3 text-sm font-semibold uppercase tracking-wide text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-60"
              aria-busy={isCheckingOut}
            >
              {isCheckingOut ? t('checkout.placing') : t('checkout.placeOrder')}
            </button>

            <p className="text-center text-xs text-muted-foreground">
              {t('checkout.message')}
            </p>

            {/* Fallback CTA if navigation fails after order was created */}
            {createdOrderId && !checkoutError ? (
              <div className="flex justify-center">
                <Link
                  href={`/shop/orders/${encodeURIComponent(createdOrderId)}`}
                  className="text-xs underline underline-offset-4"
                >
                  {t('checkout.notRedirected')}
                </Link>
              </div>
            ) : null}

            {checkoutError ? (
              <div className="space-y-2">
                <p
                  className="text-center text-xs text-destructive"
                  role="alert"
                >
                  {checkoutError}
                </p>

                {createdOrderId ? (
                  <div className="flex justify-center">
                    <Link
                      href={`/shop/orders/${encodeURIComponent(
                        createdOrderId
                      )}`}
                      className="text-xs underline underline-offset-4"
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
