// frontend/app/[locale]/shop/checkout/success/page.tsx
import { Link } from '@/i18n/routing';

import OrderStatusAutoRefresh from './OrderStatusAutoRefresh';
import { ClearCartOnMount } from '@/components/shop/clear-cart-on-mount';
import { formatMoney } from '@/lib/shop/currency';
import { getOrderSummary } from '@/lib/services/orders';
import { OrderNotFoundError } from '@/lib/services/errors';
import { orderIdParamSchema } from '@/lib/validation/shop';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SearchParams = Record<string, string | string[] | undefined>;

function getStringParam(params: SearchParams, key: string): string {
  const raw = params[key];
  if (!raw) return '';
  if (Array.isArray(raw)) return raw[0] ?? '';
  return raw;
}

function parseOrderId(params: SearchParams): string | null {
  const raw = getStringParam(params, 'orderId');
  const parsed = orderIdParamSchema.safeParse({ id: raw });
  if (!parsed.success) return null;
  return parsed.data.id;
}

function isPaymentsDisabled(params: SearchParams): boolean {
  const raw = getStringParam(params, 'paymentsDisabled');
  if (!raw) return false;
  return raw === 'true' || raw === '1';
}

function shouldClearCart(params: SearchParams): boolean {
  const raw = getStringParam(params, 'clearCart');
  return raw === 'true' || raw === '1';
}

function CheckoutShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <main
      className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8"
      aria-labelledby="checkout-title"
    >
      <section className="rounded-lg border border-border bg-card p-8 text-center">
        <h1 id="checkout-title" className="text-2xl font-bold text-foreground">
          {title}
        </h1>

        {description ? (
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        ) : null}

        {children}
      </section>
    </main>
  );
}

export default async function CheckoutSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  const resolvedParams = await searchParams;
  const clearCart = shouldClearCart(resolvedParams);

  const orderId = parseOrderId(resolvedParams);
  if (!orderId) {
    return (
      <CheckoutShell
        title="Missing order id"
        description="We couldn't identify your order. Please return to your cart or browse products."
      >
        <nav className="mt-6 flex justify-center gap-3" aria-label="Next steps">
          <Link
            href="/shop/products"
            className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold uppercase tracking-wide text-accent-foreground hover:bg-accent/90"
          >
            Back to products
          </Link>
          <Link
            href="/shop/cart"
            className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-semibold uppercase tracking-wide text-foreground hover:bg-secondary"
          >
            Go to cart
          </Link>
        </nav>
      </CheckoutShell>
    );
  }

  const paymentsDisabled = isPaymentsDisabled(resolvedParams);

  let order: Awaited<ReturnType<typeof getOrderSummary>>;
  try {
    order = await getOrderSummary(orderId);
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return (
        <CheckoutShell
          title="Order not found"
          description="We couldn't find this order. It may have been removed or never existed."
        >
          <nav
            className="mt-6 flex justify-center gap-3"
            aria-label="Next steps"
          >
            <Link
              href="/shop/products"
              className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold uppercase tracking-wide text-accent-foreground hover:bg-accent/90"
            >
              Back to products
            </Link>
            <Link
              href="/shop/cart"
              className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-semibold uppercase tracking-wide text-foreground hover:bg-secondary"
            >
              Go to cart
            </Link>
          </nav>
        </CheckoutShell>
      );
    }

    return (
      <CheckoutShell
        title="Unable to load order"
        description="Please try again later."
      />
    );
  }

  const totalMinor = order.totalAmountMinor;
  const itemsCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <main
      className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8"
      aria-labelledby="order-title"
    >
      <ClearCartOnMount enabled={clearCart} />

      {/* auto-refresh while webhook finalizes */}
      <OrderStatusAutoRefresh paymentStatus={order.paymentStatus} />

      <section className="rounded-lg border border-border bg-card p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">
          Thank you for your order
        </p>

        <h1
          id="order-title"
          className="mt-2 text-3xl font-bold text-foreground"
        >
          Order #{order.id.slice(0, 8)}
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          We&apos;ve received your order.
          {order.paymentStatus === 'paid'
            ? ' Payment has been confirmed.'
            : ' Payment is still being processed. This page will update automatically.'}
        </p>

        {paymentsDisabled ? (
          <p className="mt-3 text-sm text-amber-500" role="note">
            Payments are disabled in this environment. You were not charged for
            this order.
          </p>
        ) : null}

        <section
          className="mt-6 grid gap-6 md:grid-cols-2"
          aria-label="Order summary"
        >
          <div className="rounded-md border border-border bg-muted/40 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Order summary
            </h2>

            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Total amount</dt>
                <dd className="font-semibold text-foreground">
                  {formatMoney(totalMinor, order.currency, locale)}
                </dd>
              </div>

              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Items</dt>
                <dd className="font-medium text-foreground">{itemsCount}</dd>
              </div>

              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-semibold capitalize text-foreground">
                  {order.paymentStatus}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <nav className="mt-8 flex flex-wrap gap-3" aria-label="Next steps">
          <Link
            href="/shop/products"
            className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold uppercase tracking-wide text-accent-foreground hover:bg-accent/90"
          >
            Continue shopping
          </Link>
          <Link
            href="/shop/cart"
            className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-semibold uppercase tracking-wide text-foreground hover:bg-secondary"
          >
            View cart
          </Link>
        </nav>
      </section>
    </main>
  );
}
