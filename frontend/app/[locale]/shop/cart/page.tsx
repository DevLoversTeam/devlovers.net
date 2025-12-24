'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Minus, Plus, Trash2, ShoppingBag } from 'lucide-react';

import { useCart } from '@/components/shop/cart-provider';

import { generateIdempotencyKey } from '@/lib/shop/idempotency';
import { formatPrice } from '@/lib/shop/currency';

export default function CartPage() {
  const { cart, updateQuantity, removeFromCart, clearCart } = useCart();
  const router = useRouter();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  async function handleCheckout() {
    setCheckoutError(null);
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
          // userId: ..., // додаси, коли буде auth
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

      if (paymentProvider === 'stripe' && clientSecret) {
        clearCart();
        router.push(
          `/shop/checkout/payment/${
            data.orderId
          }?clientSecret=${encodeURIComponent(clientSecret)}`
        );
        return;
      }
      clearCart();
      const paymentsDisabledFlag =
        paymentProvider !== 'stripe' || !clientSecret
          ? '&paymentsDisabled=true'
          : '';
      router.push(
        `/shop/checkout/success?orderId=${data.orderId}${paymentsDisabledFlag}`
      );
    } catch (error) {
      console.error('Checkout failed', error);
      setCheckoutError('Unable to start checkout right now.');
    } finally {
      setIsCheckingOut(false);
    }
  }

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-center text-center">
          <ShoppingBag className="h-16 w-16 text-muted-foreground" />
          <h1 className="mt-6 text-3xl font-bold tracking-tight text-foreground">
            Your cart is empty
          </h1>
          <p className="mt-4 text-muted-foreground">
            Looks like you haven&apos;t added any items to your cart yet.
          </p>
          <Link
            href="/shop/products"
            className="mt-8 inline-flex items-center gap-2 rounded-md bg-accent px-6 py-3 text-sm font-semibold uppercase tracking-wide text-accent-foreground transition-colors hover:bg-accent/90"
          >
            Start shopping
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">
        Your cart
      </h1>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        {/* Cart Items */}
        <div className="space-y-4">
          {cart.removed.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Some items were removed from your cart because they are
              unavailable or out of stock.
            </div>
          )}

          {cart.items.map((item, index) => (
            <div
              key={`${item.productId}-${item.selectedSize}-${item.selectedColor}-${index}`}
              className="flex gap-4 rounded-lg border border-border p-4"
            >
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
                <div className="flex items-start justify-between">
                  <div>
                    <Link
                      href={`/shop/products/${item.slug}`}
                      className="text-sm font-medium text-foreground hover:underline"
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
                    onClick={() =>
                      removeFromCart(
                        item.productId,
                        item.selectedSize,
                        item.selectedColor
                      )
                    }
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Remove item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-auto flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        updateQuantity(
                          item.productId,
                          item.quantity - 1,
                          item.selectedSize,
                          item.selectedColor
                        )
                      }
                      className="flex h-8 w-8 items-center justify-center rounded border border-border text-foreground transition-colors hover:bg-secondary"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-8 text-center text-sm font-medium">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() =>
                        updateQuantity(
                          item.productId,
                          item.quantity + 1,
                          item.selectedSize,
                          item.selectedColor
                        )
                      }
                      className="flex h-8 w-8 items-center justify-center rounded border border-border text-foreground transition-colors hover:bg-secondary"
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                    {item.quantity >= item.stock && (
                      <span className="ml-3 text-xs text-muted-foreground">
                        Max {item.stock} in stock
                      </span>
                    )}
                  </div>

                  <span className="text-sm font-semibold text-foreground">
                    {formatPrice(item.unitPrice * item.quantity, item.currency)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="h-fit rounded-lg border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground">
            Order summary
          </h2>

          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium text-foreground">
                {formatPrice(cart.summary.totalAmount, cart.summary.currency)}
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
                  {formatPrice(cart.summary.totalAmount)}
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
            >
              {isCheckingOut ? 'Placing order...' : 'Place order'}
            </button>

            <p className="text-center text-xs text-muted-foreground">
              You&apos;ll either be redirected to secure payment or see
              confirmation if payment is not required in this environment.
            </p>

            {checkoutError && (
              <p className="text-center text-xs text-destructive">
                {checkoutError}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
