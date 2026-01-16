import 'server-only';

import { Link } from '@/i18n/routing';
import { notFound, redirect } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { orderItems, orders } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { orderIdParamSchema } from '@/lib/validation/shop';
import { logError } from '@/lib/logging';

export const dynamic = 'force-dynamic';

type OrderCurrency = (typeof orders.$inferSelect)['currency'];

type OrderDetail = {
  id: string;
  userId: string | null;
  totalAmount: string;
  currency: OrderCurrency;
  paymentStatus:
    | 'pending'
    | 'requires_payment'
    | 'paid'
    | 'failed'
    | 'refunded';
  paymentProvider: string;
  paymentIntentId: string | null;
  stockRestored: boolean;
  restockedAt: string | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  items: Array<{
    id: string;
    productId: string;
    productTitle: string | null;
    productSlug: string | null;
    productSku: string | null;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
  }>;
};

function toOrderItem(
  item: {
    id: string | null;
    productId: string | null;
    productTitle: string | null;
    productSlug: string | null;
    productSku: string | null;
    quantity: number | null;
    unitPrice: string | null;
    lineTotal: string | null;
  } | null
): OrderDetail['items'][number] | null {
  if (!item || !item.id) return null;

  if (
    !item.productId ||
    item.quantity === null ||
    !item.unitPrice ||
    !item.lineTotal
  ) {
    throw new Error('Corrupt order item row: required columns are null');
  }

  return {
    id: item.id,
    productId: item.productId,
    productTitle: item.productTitle,
    productSlug: item.productSlug,
    productSku: item.productSku,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
  };
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  noStore();

  const { locale, id } = await params;

  const user = await getCurrentUser();
  if (!user) {
    redirect(
      `/${locale}/login?next=${encodeURIComponent(
        `/${locale}/shop/orders/${id}`
      )}`
    );
  }

  const parsed = orderIdParamSchema.safeParse({ id });
  if (!parsed.success) notFound();

  const isAdmin = user.role === 'admin';

  let order: OrderDetail;

  try {
    const whereClause = isAdmin
      ? eq(orders.id, parsed.data.id)
      : and(eq(orders.id, parsed.data.id), eq(orders.userId, user.id));

    const rows = await db
      .select({
        order: {
          id: orders.id,
          userId: orders.userId,
          totalAmount: orders.totalAmount,
          currency: orders.currency,
          paymentStatus: orders.paymentStatus,
          paymentProvider: orders.paymentProvider,
          paymentIntentId: orders.paymentIntentId,
          stockRestored: orders.stockRestored,
          restockedAt: orders.restockedAt,
          idempotencyKey: orders.idempotencyKey,
          createdAt: orders.createdAt,
          updatedAt: orders.updatedAt,
        },
        item: {
          id: orderItems.id,
          productId: orderItems.productId,
          productTitle: orderItems.productTitle,
          productSlug: orderItems.productSlug,
          productSku: orderItems.productSku,
          quantity: orderItems.quantity,
          unitPrice: orderItems.unitPrice,
          lineTotal: orderItems.lineTotal,
        },
      })
      .from(orders)
      .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
      .where(whereClause)
      .orderBy(orderItems.id);

    // non-admin: "не існує" == "не твій"
    if (rows.length === 0) notFound();

    const base = rows[0]!.order;

    const items = rows
      .map(r => toOrderItem(r.item))
      .filter((i): i is NonNullable<typeof i> => i !== null);

    order = {
      ...base,
      createdAt: base.createdAt.toISOString(),
      updatedAt: base.updatedAt.toISOString(),
      restockedAt: base.restockedAt ? base.restockedAt.toISOString() : null,
      items,
    };
  } catch (error) {
    logError('User order detail page failed', error);
    throw new Error('ORDER_DETAIL_LOAD_FAILED');
  }

  return (
    <main
      className="mx-auto w-full max-w-3xl px-4 py-8"
      aria-labelledby="order-heading"
    >
      <header className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 id="order-heading" className="truncate text-2xl font-semibold">
            Order
          </h1>
          <div className="mt-1 truncate text-xs opacity-80">{order.id}</div>
        </div>

        <nav
          className="flex flex-wrap items-center justify-end gap-3"
          aria-label="Order navigation"
        >
          <Link
            className="text-sm underline underline-offset-4"
            href="/shop/orders"
          >
            My orders
          </Link>
          <Link className="text-sm underline underline-offset-4" href="/shop">
            Shop
          </Link>
        </nav>
      </header>

      <section
        className="mb-6 rounded-md border p-4"
        aria-labelledby="order-summary-heading"
      >
        <h2 id="order-summary-heading" className="sr-only">
          Order summary
        </h2>

        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs opacity-80">Total</dt>
            <dd className="text-sm font-medium">
              {order.totalAmount} {String(order.currency)}
            </dd>
          </div>

          <div>
            <dt className="text-xs opacity-80">Payment status</dt>
            <dd className="text-sm font-medium">
              {String(order.paymentStatus)}
            </dd>
          </div>

          <div>
            <dt className="text-xs opacity-80">Created</dt>
            <dd className="text-sm">{order.createdAt}</dd>
          </div>

          {isAdmin && (
            <div>
              <dt className="text-xs opacity-80">Provider</dt>
              <dd className="text-sm">{String(order.paymentProvider)}</dd>
            </div>
          )}
        </dl>

        {isAdmin && (
          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs opacity-80">Payment reference</dt>
              <dd className="text-sm break-all">
                {order.paymentIntentId ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs opacity-80">Idempotency key</dt>
              <dd className="text-sm break-all">{order.idempotencyKey}</dd>
            </div>
          </dl>
        )}

        {isAdmin && (
          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs opacity-80">Stock restored</dt>
              <dd className="text-sm">
                {order.stockRestored ? 'true' : 'false'}
              </dd>
            </div>
            <div>
              <dt className="text-xs opacity-80">Restocked at</dt>
              <dd className="text-sm">{order.restockedAt ?? '—'}</dd>
            </div>
          </dl>
        )}
      </section>

      <section
        className="rounded-md border"
        aria-labelledby="order-items-heading"
      >
        <div className="border-b p-4">
          <h2 id="order-items-heading" className="text-lg font-semibold">
            Items
          </h2>
        </div>

        <ul className="divide-y" aria-label="Order items">
          {order.items.map(it => (
            <li key={it.id} className="p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {it.productTitle ??
                      it.productSlug ??
                      it.productSku ??
                      it.productId}
                  </div>
                  <div className="mt-1 break-all text-xs opacity-80">
                    {it.productSku
                      ? `SKU: ${it.productSku}`
                      : `Product: ${it.productId}`}
                  </div>
                </div>

                <dl className="flex flex-col items-start gap-1 sm:items-end">
                  <div>
                    <dt className="sr-only">Quantity</dt>
                    <dd className="text-sm">Qty: {it.quantity}</dd>
                  </div>
                  <div>
                    <dt className="sr-only">Unit price</dt>
                    <dd className="text-sm opacity-80">Unit: {it.unitPrice}</dd>
                  </div>
                  <div>
                    <dt className="sr-only">Line total</dt>
                    <dd className="text-sm font-medium">
                      Line: {it.lineTotal}
                    </dd>
                  </div>
                </dl>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
