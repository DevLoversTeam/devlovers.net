import Link from "next/link";

import { formatPrice } from "@/lib/shop/currency";
import { getOrderSummary } from "@/lib/services/orders";
import { OrderNotFoundError } from "@/lib/services/errors";
import { orderIdParamSchema } from "@/lib/validation/shop";

type SearchParams = Record<string, string | string[] | undefined>;

function getStringParam(params: SearchParams, key: string): string {
  const raw = params[key];
  if (!raw) return "";
  if (Array.isArray(raw)) return raw[0] ?? "";
  return raw;
}

function parseOrderId(params: SearchParams): string | null {
  const raw = getStringParam(params, "orderId");
  const parsed = orderIdParamSchema.safeParse({ id: raw });
  if (!parsed.success) return null;
  return parsed.data.id;
}

function isPaymentsDisabled(params: SearchParams): boolean {
  const raw = getStringParam(params, "paymentsDisabled");
  if (!raw) return false;
  return raw === "true" || raw === "1";
}

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedParams = await searchParams;
  const orderId = parseOrderId(resolvedParams);

  if (!orderId) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <h1 className="text-2xl font-bold text-foreground">Missing order id</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We couldn&apos;t identify your order. Please return to your cart or browse products.
          </p>
          <div className="mt-6 flex justify-center gap-3">
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
          </div>
        </div>
      </div>
    );
  }

  const paymentsDisabled = isPaymentsDisabled(resolvedParams);

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

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="rounded-lg border border-border bg-card p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">
          Thank you for your order
        </p>
        <h1 className="mt-2 text-3xl font-bold text-foreground">
          Order #{order.id.slice(0, 8)}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We&apos;ve received your order.
          {order.paymentStatus === "paid"
            ? " Payment has been confirmed."
            : " Payment is still being processed."}
        </p>

        {paymentsDisabled && (
          <p className="mt-3 text-sm text-amber-500">
            Payments are disabled in this environment. You were not charged for this order.
          </p>
        )}

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="rounded-md border border-border bg-muted/40 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Order summary
            </h2>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span>Total amount</span>
                <span className="font-semibold text-foreground">
                  {formatPrice(order.totalAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Items</span>
                <span className="font-medium text-foreground">
                  {order.items.reduce((sum, item) => sum + item.quantity, 0)}
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

        <div className="mt-8 flex flex-wrap gap-3">
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
        </div>
      </div>
    </div>
  );
}
