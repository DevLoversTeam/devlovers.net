import { Link } from '@/i18n/routing';

import StripePaymentClient from "../StripePaymentClient";
import { formatMoney } from "@/lib/shop/currency";
import { getOrderSummary } from "@/lib/services/orders";
import { OrderNotFoundError } from "@/lib/services/errors";
import { orderIdParamSchema } from "@/lib/validation/shop";
import { getStripeEnv } from "@/lib/env/stripe";

function getOrderId(params: { orderId?: string }) {
  const parsed = orderIdParamSchema.safeParse({ id: params.orderId ?? "" });
  if (!parsed.success) return null;
  return parsed.data.id;
}

function resolveClientSecret(searchParams?: Record<string, string | string[] | undefined>) {
  const raw = searchParams?.clientSecret;
  if (!raw) return "";
  if (Array.isArray(raw)) return raw[0] ?? "";
  return raw;
}

function buildStatusMessage(status: string) {
  if (status === "paid") {
    return "This order is already paid.";
  }

  if (status === "failed") {
    return "The previous payment attempt failed. Please try again.";
  }

  return "Complete payment to finish your order.";
}

type PaymentPageProps = {
  params: Promise<{ locale: string; orderId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};


export default async function PaymentPage(props: PaymentPageProps) {
  const params = await props.params;
  const searchParams = props.searchParams ? await props.searchParams : undefined;
  const { locale } = params;

  const orderId = getOrderId(params);

  if (!orderId) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <h1 className="text-2xl font-bold text-foreground">Invalid order</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We couldn&apos;t identify your order. Please return to your cart.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href={`/${locale}/shop/cart`}
              className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-semibold uppercase tracking-wide text-foreground hover:bg-secondary"
            >
              Go to cart
            </Link>
            <Link href={`/${locale}/shop/products`}
              className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold uppercase tracking-wide text-accent-foreground hover:bg-accent/90"
            >
              Continue shopping
            </Link>
          </div>
        </div>
      </div>
    );
  }

  let order;

  try {
    order = await getOrderSummary(orderId);
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return (
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <h1 className="text-2xl font-bold text-foreground">Order not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We couldn&apos;t find this order. It may have been removed or never existed.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Link href={`/${locale}/shop/cart`}
                className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-semibold uppercase tracking-wide text-foreground hover:bg-secondary"
              >
                Go to cart
              </Link>
              <Link href={`/${locale}/shop/products`}
                className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold uppercase tracking-wide text-accent-foreground hover:bg-accent/90"
              >
                Continue shopping
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <h1 className="text-2xl font-bold text-foreground">Unable to load order</h1>
          <p className="mt-2 text-sm text-muted-foreground">Please try again later.</p>
        </div>
      </div>
    );
  }

  const stripeEnv = getStripeEnv();
  const paymentsEnabled = stripeEnv.paymentsEnabled && Boolean(stripeEnv.publishableKey);
  const clientSecret = resolveClientSecret(searchParams);
  const publishableKey = paymentsEnabled ? stripeEnv.publishableKey : null;

  if (order.paymentStatus === "paid") {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <h1 className="text-2xl font-bold text-foreground">Order already paid</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We&apos;ve already confirmed payment for this order.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href={`/${locale}/shop/checkout/success?orderId=${order.id}`}
              className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold uppercase tracking-wide text-accent-foreground hover:bg-accent/90"
            >
              View confirmation
            </Link>
            <Link href={`/${locale}/shop/products`}
              className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-semibold uppercase tracking-wide text-foreground hover:bg-secondary"
            >
              Continue shopping
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">
          Secure checkout
        </p>
        <h1 className="text-3xl font-bold text-foreground">
          Pay for order #{order.id.slice(0, 8)}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {buildStatusMessage(order.paymentStatus)}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Payment details</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Complete payment to place your order.
          </p>

          <div className="mt-6 rounded-md border border-border bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Amount due</span>
              <span className="text-xl font-bold text-foreground">
                {formatMoney(order.totalAmount, order.currency, locale)}
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
              amount={order.totalAmount}
              currency={order.currency}
              publishableKey={publishableKey}
              paymentsEnabled={paymentsEnabled}
              locale={locale}
            />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Order summary</h2>
          <div className="mt-4 space-y-3 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>Items</span>
              <span className="font-medium text-foreground">
                {order.items.reduce((sum, item) => sum + item.quantity, 0)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Total amount</span>
              <span className="font-semibold text-foreground">
                {formatMoney(order.totalAmount, order.currency, locale)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Status</span>
              <span className="font-semibold capitalize text-foreground">
                {order.paymentStatus}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
