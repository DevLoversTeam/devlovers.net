'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { Minus, Plus, Trash2, ShoppingBag } from 'lucide-react';

import { Link } from '@/i18n/routing';
import { useCart } from '@/components/shop/cart-provider';
import { generateIdempotencyKey } from '@/lib/shop/idempotency';
import { formatMoney } from '@/lib/shop/currency';

export default function CartPage() {
  const { cart, updateQuantity, removeFromCart } = useCart();
  const router = useRouter();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  const params = useParams<{ locale?: string }>();
  const locale = params.locale ?? 'en';
  const shopBase = useMemo(() => `/shop`, []);

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
            Your cart is empty
          </h1>
          <p className="mt-4 text-muted-foreground">
            Looks like you haven&apos;t added any items to your cart yet.
          </p>
          <Link
            href={`/shop/products`}
            className="mt-8 inline-flex items-center gap-2 rounded-md bg-accent px-6 py-3 text-sm font-semibold uppercase tracking-wide text-accent-foreground transition-colors hover:bg-accent/90"
          >
            Start shopping
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">
        Your cart
      </h1>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        <section aria-label="Cart items">
          <ul className="space-y-4">
            {cart.removed.length > 0 && (
              <li
                className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
                role="status"
                aria-live="polite"
              >
                Some items were removed from your cart because they are
                unavailable or out of stock.
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
                            {[item.selectedColor, item.selectedSize]
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
                        aria-label={`Remove ${item.title} from cart`}
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
                          aria-label="Decrease quantity"
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
                          aria-label="Increase quantity"
                        >
                          <Plus className="h-3 w-3" aria-hidden="true" />
                        </button>

                        {item.quantity >= item.stock && (
                          <span
                            className="ml-3 text-xs text-muted-foreground"
                            role="status"
                          >
                            Max {item.stock} in stock
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
            Order summary
          </h2>

          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium text-foreground">
                {formatMoney(
                  cart.summary.totalAmountMinor,
                  cart.summary.currency,
                  locale
                )}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Shipping</span>
              <span className="text-muted-foreground">
                Calculated at checkout
              </span>
            </div>

            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold text-foreground">
                  Total
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
              {isCheckingOut ? 'Placing order...' : 'Place order'}
            </button>

            <p className="text-center text-xs text-muted-foreground">
              You&apos;ll either be redirected to secure payment or see
              confirmation if payment is not required in this environment.
            </p>

            {/* Fallback CTA if navigation fails after order was created */}
            {createdOrderId && !checkoutError ? (
              <div className="flex justify-center">
                <Link
                  href={`/shop/orders/${encodeURIComponent(createdOrderId)}`}
                  className="text-xs underline underline-offset-4"
                >
                  If you are not redirected automatically, open your order
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
                      Go to order
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
