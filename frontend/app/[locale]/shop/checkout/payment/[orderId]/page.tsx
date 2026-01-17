import { Link } from '@/i18n/routing';
import { ClearCartOnMount } from '@/components/shop/clear-cart-on-mount';
import StripePaymentClient from '../StripePaymentClient';
import { formatMoney } from '@/lib/shop/currency';
import { getOrderSummary } from '@/lib/services/orders';
import { OrderNotFoundError } from '@/lib/services/errors';
import { orderIdParamSchema } from '@/lib/validation/shop';
import { getStripeEnv } from '@/lib/env/stripe';
import { logError } from '@/lib/logging';
import { ensureStripePaymentIntentForOrder } from '@/lib/services/orders/payment-attempts';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getOrderId(params: { orderId?: string }) {
  const parsed = orderIdParamSchema.safeParse({ id: params.orderId ?? '' });
  if (!parsed.success) return null;
  return parsed.data.id;
}

function resolveClientSecret(
  searchParams?: Record<string, string | string[] | undefined>
) {
  const raw = searchParams?.clientSecret;
  if (!raw) return '';
  if (Array.isArray(raw)) return raw[0] ?? '';
  return raw;
}

function buildStatusMessage(status: string) {
  if (status === 'paid') {
    return 'This order is already paid.';
  }

  if (status === 'failed') {
    return 'The previous payment attempt failed. Please try again.';
  }

  return 'Complete payment to finish your order.';
}

function shouldClearCart(
  searchParams?: Record<string, string | string[] | undefined>
): boolean {
  const raw = searchParams?.clearCart;
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === 'true' || v === '1';
}

type PaymentPageProps = {
  params: Promise<{ locale: string; orderId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function PageShell({
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
      aria-labelledby="payment-title"
    >
      <section className="rounded-lg border border-border bg-card p-8 text-center">
        <h1 id="payment-title" className="text-2xl font-bold text-foreground">
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

export default async function PaymentPage(props: PaymentPageProps) {
  const params = await props.params;
  const searchParams = props.searchParams
    ? await props.searchParams
    : undefined;
  const clearCart = shouldClearCart(searchParams);
  const cc = clearCart ? '&clearCart=1' : '';
  const { locale } = params;
  const shopBase = `/${locale}/shop`;

  const orderId = getOrderId(params);

  if (!orderId) {
    return (
      <PageShell
        title="Invalid order"
        description="We couldn't identify your order. Please return to your cart."
      >
        <nav className="mt-6 flex justify-center gap-3" aria-label="Next steps">
          <Link
            href={`${shopBase}/cart`}
            className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-semibold uppercase tracking-wide text-foreground hover:bg-secondary"
          >
            Go to cart
          </Link>
          <Link
            href={`${shopBase}/products`}
            className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold uppercase tracking-wide text-accent-foreground hover:bg-accent/90"
          >
            Continue shopping
          </Link>
        </nav>
      </PageShell>
    );
  }

  let order: Awaited<ReturnType<typeof getOrderSummary>>;

  try {
    order = await getOrderSummary(orderId);
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return (
        <PageShell
          title="Order not found"
          description="We couldn't find this order. It may have been removed or never existed."
        >
          <nav
            className="mt-6 flex justify-center gap-3"
            aria-label="Next steps"
          >
            <Link
              href={`${shopBase}/cart`}
              className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-semibold uppercase tracking-wide text-foreground hover:bg-secondary"
            >
              Go to cart
            </Link>
            <Link
              href={`${shopBase}/products`}
              className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold uppercase tracking-wide text-accent-foreground hover:bg-accent/90"
            >
              Continue shopping
            </Link>
          </nav>
        </PageShell>
      );
    }

    return (
      <PageShell
        title="Unable to load order"
        description="Please try again later."
      />
    );
  }

  const stripeEnv = getStripeEnv();
  const paymentsEnabled =
    stripeEnv.paymentsEnabled && Boolean(stripeEnv.publishableKey);
  let clientSecret = resolveClientSecret(searchParams);
  const publishableKey = paymentsEnabled ? stripeEnv.publishableKey : null;

  // Ensure we have a clientSecret even when URL doesn't include ?clientSecret=...
  // Source of truth for payment finality is webhook; this only initializes Elements.
  // if (
  //   paymentsEnabled &&
  //   publishableKey &&
  //   (!clientSecret || !clientSecret.trim())
  // ) {
  //   const existingPi = order.paymentIntentId?.trim() ?? '';
  //   let phase:
  //     | 'retrievePaymentIntent'
  //     | 'createPaymentIntent'
  //     | 'setOrderPaymentIntent'
  //     | 'unknown' = 'unknown';

  //   try {
  //     if (existingPi) {
  //       phase = 'retrievePaymentIntent';
  //       const retrieved = await retrievePaymentIntent(existingPi);
  //       clientSecret = retrieved.clientSecret;
  //     } else {
  //       phase = 'createPaymentIntent';
  //       const snapshot = await readStripePaymentIntentParams(order.id);
  //       const created = await createPaymentIntent({
  //         amount: snapshot.amountMinor,
  //         currency: snapshot.currency,
  //         orderId: order.id,
  //         idempotencyKey: `pi:${order.id}`,
  //       });

  //       phase = 'setOrderPaymentIntent';
  //       await setOrderPaymentIntent({
  //         orderId: order.id,
  //         paymentIntentId: created.paymentIntentId,
  //       });

  //       clientSecret = created.clientSecret;
  //     }
  //   } catch (error) {
  //     logError('payment_page_failed', error, {
  //       orderId: order.id,
  //       existingPi,
  //       phase,
  //     });

  //     // Leave clientSecret empty -> UI shows "Payment cannot be initialized"
  //   }
  // }

  if (
    paymentsEnabled &&
    publishableKey &&
    (!clientSecret || !clientSecret.trim())
  ) {
    const existingPi = order.paymentIntentId?.trim() ?? '';
    let phase: 'ensureStripePaymentIntentForOrder' | 'unknown' = 'unknown';

    try {
      phase = 'ensureStripePaymentIntentForOrder';
      const ensured = await ensureStripePaymentIntentForOrder({
        orderId: order.id,
        existingPaymentIntentId: existingPi || null,
      });

      clientSecret = ensured.clientSecret;
    } catch (error) {
      logError('payment_page_failed', error, {
        orderId: order.id,
        existingPi,
        phase,
      });
    }
  }

  if (order.paymentStatus === 'paid') {
    return (
      <>
        <ClearCartOnMount enabled={clearCart} />
        <PageShell
          title="Order already paid"
          description="We've already confirmed payment for this order."
        >
          <nav
            className="mt-6 flex justify-center gap-3"
            aria-label="Next steps"
          >
            <Link
              href={`${shopBase}/checkout/success?orderId=${order.id}${cc}`}
              className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold uppercase tracking-wide text-accent-foreground hover:bg-accent/90"
            >
              View confirmation
            </Link>
            <Link
              href={`${shopBase}/products`}
              className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-semibold uppercase tracking-wide text-foreground hover:bg-secondary"
            >
              Continue shopping
            </Link>
          </nav>
        </PageShell>
      </>
    );
  }

  const itemsCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <main
      className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8"
      aria-labelledby="pay-order-title"
    >
      <ClearCartOnMount enabled={clearCart} />

      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">
          Secure checkout
        </p>
        <h1 id="pay-order-title" className="text-3xl font-bold text-foreground">
          Pay for order #{order.id.slice(0, 8)}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {buildStatusMessage(order.paymentStatus)}
        </p>
      </header>

      <section
        className="grid gap-6 lg:grid-cols-[1.2fr_1fr]"
        aria-label="Payment and order summary"
      >
        <section
          className="rounded-lg border border-border bg-card p-6"
          aria-label="Payment details"
        >
          <h2 className="text-lg font-semibold text-foreground">
            Payment details
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Complete payment to place your order.
          </p>

          <div className="mt-6 rounded-md border border-border bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Amount due</span>
              <span className="text-xl font-bold text-foreground">
                {formatMoney(order.totalAmountMinor, order.currency, locale)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground uppercase tracking-wide">
              {order.currency}
            </p>
          </div>

          <div className="mt-6">
            <StripePaymentClient
              clientSecret={clientSecret}
              orderId={order.id}
              amountMinor={order.totalAmountMinor}
              currency={order.currency}
              publishableKey={publishableKey}
              paymentsEnabled={paymentsEnabled}
              locale={locale}
            />
          </div>
        </section>

        <aside
          className="rounded-lg border border-border bg-card p-6"
          aria-label="Order summary"
        >
          <h2 className="text-lg font-semibold text-foreground">
            Order summary
          </h2>

          <dl className="mt-4 space-y-3 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <dt>Items</dt>
              <dd className="font-medium text-foreground">{itemsCount}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>Total amount</dt>
              <dd className="font-semibold text-foreground">
                {formatMoney(order.totalAmountMinor, order.currency, locale)}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>Status</dt>
              <dd className="font-semibold capitalize text-foreground">
                {order.paymentStatus}
              </dd>
            </div>
          </dl>
        </aside>
      </section>
    </main>
  );
}
