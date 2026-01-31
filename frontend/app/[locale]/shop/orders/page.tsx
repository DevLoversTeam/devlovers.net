import 'server-only';
import { cn } from '@/lib/utils';
import { Link } from '@/i18n/routing';
import { redirect } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { desc, eq, sql } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';

import { db } from '@/db';
import { orderItems, orders } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { logError } from '@/lib/logging';
import {
  SHOP_FOCUS,
  SHOP_LINK_BASE,
  SHOP_LINK_MD,
  SHOP_NAV_LINK_BASE,
} from '@/lib/shop/ui-classes';
export const dynamic = 'force-dynamic';

type PaymentStatus = (typeof orders.$inferSelect)['paymentStatus'];
type OrderCurrency = (typeof orders.$inferSelect)['currency'];

function shortOrderId(id: string) {
  if (!id) return '';
  if (id.length <= 14) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function formatDateTime(d: Date, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function statusLabel(
  status: PaymentStatus,
  t: Awaited<ReturnType<typeof getTranslations<'shop.orders'>>>
) {
  switch (status) {
    case 'paid':
      return t('paymentStatus.paid');
    case 'pending':
      return t('paymentStatus.pending');
    case 'requires_payment':
      return t('paymentStatus.requiresPayment');
    case 'failed':
      return t('paymentStatus.failed');
    case 'refunded':
      return t('paymentStatus.refunded');
    default:
      return String(status);
  }
}

function statusClassName(status: PaymentStatus) {
  switch (status) {
    case 'failed':
      return 'border border-border bg-destructive/10 text-destructive';
    case 'paid':
    case 'requires_payment':
    case 'refunded':
    case 'pending':
    default:
      return 'border border-border bg-muted/40 text-foreground';
  }
}

function toCount(v: unknown): number {
  let n = 0;

  if (typeof v === 'number') n = v;
  else if (typeof v === 'bigint') n = Number(v);
  else if (typeof v === 'string') n = Number(v);

  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

function looksLikeUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    s.trim()
  );
}

function buildOrderHeadline(
  primary: string | null,
  count: number,
  id: string,
  t: Awaited<ReturnType<typeof getTranslations<'shop.orders'>>>
) {
  if (count === 0)
    return t('orderHeadline.incomplete', { id: shortOrderId(id) });

  if (primary) {
    if (count > 1)
      return t('orderHeadline.withMore', { item: primary, count: count - 1 });
    return primary;
  }

  return t('orderHeadline.default', { id: shortOrderId(id) });
}

export default async function MyOrdersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  noStore();

  const { locale } = await params;
  const t = await getTranslations('shop.orders');

  const user = await getCurrentUser();
  if (!user) {
    redirect(
      `/${locale}/login?returnTo=${encodeURIComponent(`/${locale}/shop/orders`)}`
    );
  }

  let rows: Array<{
    id: string;
    totalAmount: string;
    currency: OrderCurrency;
    paymentStatus: PaymentStatus;
    createdAt: Date;
    primaryItemLabel: string | null;
    itemCount: unknown;
  }> = [];

  try {
    rows = await db
      .select({
        id: orders.id,
        totalAmount: orders.totalAmount,
        currency: orders.currency,
        paymentStatus: orders.paymentStatus,
        createdAt: orders.createdAt,

        primaryItemLabel: sql<string | null>`
          (
            array_agg(
              coalesce(
                nullif(trim(${orderItems.productTitle}), ''),
                nullif(trim(${orderItems.productSlug}), ''),
                nullif(trim(${orderItems.productSku}), '')
              )
              order by ${orderItems.id}
            )
            filter (
              where coalesce(
                nullif(trim(${orderItems.productTitle}), ''),
                nullif(trim(${orderItems.productSlug}), ''),
                nullif(trim(${orderItems.productSku}), '')
              ) is not null
            )
          )[1]
        `,
        itemCount: sql`count(${orderItems.id})`,
      })
      .from(orders)
      .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
      .where(eq(orders.userId, user.id))
      .groupBy(
        orders.id,
        orders.totalAmount,
        orders.currency,
        orders.paymentStatus,
        orders.createdAt
      )
      .orderBy(desc(orders.createdAt))
      .limit(50);
  } catch (error) {
    logError('My orders page failed', error);
    throw new Error('MY_ORDERS_LOAD_FAILED');
  }
  // Nav/breadcrumb-ish links ("Back to shop", "Browse products")
  const NAV_LINK = cn(SHOP_NAV_LINK_BASE, 'text-lg', SHOP_FOCUS);

  // Order headline link in the table: make it match cart product link style
  // (cart uses: cn('block truncate', SHOP_LINK_BASE, SHOP_LINK_MD, SHOP_FOCUS))
  const ORDER_HEADLINE_LINK = cn(
    'block max-w-[24rem] truncate',
    SHOP_LINK_BASE,
    SHOP_LINK_MD,
    SHOP_FOCUS
  );

  return (
    <main
      className="mx-auto w-full max-w-3xl px-4 py-8"
      aria-labelledby="my-orders-heading"
    >
      <header className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 id="my-orders-heading" className="text-2xl font-semibold">
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>

        <nav aria-label="Orders navigation" className="flex items-center gap-3">
          <Link className={NAV_LINK} href="/shop">
            {t('backToShop')}
          </Link>
        </nav>
      </header>

      {rows.length === 0 ? (
        <section className="rounded-md border p-4" aria-label="No orders">
          <p className="text-sm text-muted-foreground">{t('empty.message')}</p>
          <div className="mt-3">
            <Link className={NAV_LINK} href="/shop/products">
              {t('empty.browseProducts')}
            </Link>
          </div>
        </section>
      ) : (
        <section className="rounded-md border" aria-label="Orders list">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <caption className="sr-only">{t('table.caption')}</caption>

              <thead className="border-b border-border">
                <tr>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground"
                  >
                    {t('table.items')}
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground"
                  >
                    {t('table.date')}
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground"
                  >
                    {t('table.status')}
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground"
                  >
                    {t('table.total')}
                  </th>
                </tr>
              </thead>

              <tbody>
                {rows.map(o => {
                  const href = `/shop/orders/${o.id}`;
                  const dt = o.createdAt.toISOString();

                  const count = toCount(o.itemCount);

                  const rawPrimary = o.primaryItemLabel?.trim() || null;
                  const primary =
                    rawPrimary && !looksLikeUuid(rawPrimary)
                      ? rawPrimary
                      : null;

                  const headline = buildOrderHeadline(primary, count, o.id, t);

                  return (
                    <tr
                      key={o.id}
                      className="border-b border-border last:border-b-0 hover:bg-muted/20"
                    >
                      <th scope="row" className="px-4 py-3 align-top text-left">
                        <Link
                          href={href}
                          className={ORDER_HEADLINE_LINK}
                          title={headline}
                          aria-label={t('table.openOrder', { id: o.id })}
                        >
                          {headline}
                        </Link>

                        <div className="mt-1 text-xs text-muted-foreground">
                          <span className="sr-only">
                            {t('table.orderId')}:{' '}
                          </span>
                          <span className="break-all">
                            {shortOrderId(o.id)}
                          </span>
                        </div>
                      </th>

                      <td className="px-4 py-3 align-top text-sm">
                        <time dateTime={dt}>
                          {formatDateTime(o.createdAt, locale)}
                        </time>
                      </td>

                      <td className="px-4 py-3 align-top">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusClassName(
                            o.paymentStatus
                          )}`}
                        >
                          {statusLabel(o.paymentStatus, t)}
                        </span>
                      </td>

                      <td className="px-4 py-3 align-top text-right text-sm font-medium">
                        {String(o.totalAmount)} {String(o.currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
