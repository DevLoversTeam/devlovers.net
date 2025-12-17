import Link from "next/link"

import { formatPrice } from "@/lib/shop/currency"
import { OrderNotFoundError } from "@/lib/services/errors"
import { getOrderSummary } from "@/lib/services/orders"
import { orderIdParamSchema } from "@/lib/validation/shop"

function parseOrderId(searchParams?: Record<string, string | string[] | undefined>) {
  const raw = searchParams?.orderId
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value) return null
  const parsed = orderIdParamSchema.safeParse({ id: value })
  return parsed.success ? parsed.data.id : null
}

export default async function CheckoutErrorPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const orderId = parseOrderId(searchParams)

  if (!orderId) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <h1 className="text-2xl font-bold text-foreground">Missing order id</h1>
          <p className="mt-2 text-sm text-muted-foreground">We couldn’t identify your order.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/shop/cart"
              className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-semibold uppercase tracking-wide text-foreground hover:bg-secondary"
            >
              Back to cart
            </Link>
            <Link
              href="/shop/products"
              className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold uppercase tracking-wide text-accent-foreground hover:bg-accent/90"
            >
              Continue shopping
            </Link>
          </div>
        </div>
      </div>
    )
  }

  let order

  try {
    order = await getOrderSummary(orderId)
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return (
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <h1 className="text-2xl font-bold text-foreground">Order not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">We couldn’t find this order.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href="/shop/cart"
                className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-semibold uppercase tracking-wide text-foreground hover:bg-secondary"
              >
                Back to cart
              </Link>
              <Link
                href="/shop/products"
                className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold uppercase tracking-wide text-accent-foreground hover:bg-accent/90"
              >
                Continue shopping
              </Link>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <h1 className="text-2xl font-bold text-foreground">Unable to load order</h1>
          <p className="mt-2 text-sm text-muted-foreground">Please try again later.</p>
        </div>
      </div>
    )
  }

  const isFailed = order.paymentStatus === "failed"

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="rounded-lg border border-border bg-card p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-foreground">{isFailed ? "Payment failed" : "Payment status unclear"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isFailed
            ? "The payment for this order was not completed. You can try again or contact support."
            : "We could not confirm a payment failure for this order."}
        </p>

        <div className="mt-6 rounded-md border border-border bg-muted/30 p-4 text-sm text-foreground">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Order</span>
            <span className="font-semibold">{order.id}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Total</span>
            <span className="font-semibold">{formatPrice(order.totalAmount)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            <span className="font-semibold capitalize">{order.paymentStatus}</span>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/cart"
            className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-semibold uppercase tracking-wide text-foreground hover:bg-secondary"
          >
            Back to cart
          </Link>
          {isFailed && order.id && (
            <Link
              href={`/checkout/payment/${order.id}`}
              className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold uppercase tracking-wide text-accent-foreground hover:bg-accent/90"
            >
              Retry payment
            </Link>
          )}
          <Link
            href="/products"
            className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-semibold uppercase tracking-wide text-foreground hover:bg-secondary"
          >
            Continue shopping
          </Link>
        </div>
      </div>
    </div>
  )
}
