import 'server-only';

import { desc, eq, sql } from 'drizzle-orm';
import { Metadata } from 'next';
import { unstable_noStore as noStore } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { db } from '@/db';
import { orderItems, orders } from '@/db/schema';
import { Link } from '@/i18n/routing';
import { getCurrentUser } from '@/lib/auth';
import { logError } from '@/lib/logging';
import { type CurrencyCode, formatMoney } from '@/lib/shop/currency';
import { fromDbMoney } from '@/lib/shop/money';
import {
  SHOP_FOCUS,
  SHOP_LINK_BASE,
  SHOP_LINK_MD,
  SHOP_NAV_LINK_BASE,
} from '@/lib/shop/ui-classes';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'My Orders | DevLovers',
  description: 'View your order history and payment status.',
};

export const dynamic = 'force-dynamic';

type PaymentStatus = (typeof orders.$inferSelect)['paymentStatus'];
type OrderCurrency = (typeof orders.$inferSelect)['currency'];

function shortOrderId(id: string) {
  if (!id) return '';
  if (id.length <= 14) return id;
  return `${id.slice(0, 8)}...${id.slice(-4)}`;
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

function formatOrderTotal(
  major: string,
  currency: OrderCurrency,
  locale: string
): string {
  try {
    const currencyCode: CurrencyCode = currency === 'UAH' ? 'UAH' : 'USD';
    return formatMoney(fromDbMoney(major), currencyCode, locale);
  } catch {
    return `${major} ${currency}`;
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
    case 'needs_review':
      return t('paymentStatus.needsReview');
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
    case 'needs_review':
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

  const NAV_LINK = cn(SHOP_NAV_LINK_BASE, 'text-lg', SHOP_FOCUS);

  const ORDER_HEADLINE_LINK = cn(
    'block max-w-full',
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
          <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
        </div>

        <nav aria-label="Orders navigation" className="flex items-center gap-3">
          <Link className={NAV_LINK} href="/shop">
            {t('backToShop')}
          </Link>
        </nav>
      </header>

      {rows.length === 0 ? (
        <section className="rounded-md border p-4" aria-label="No orders">
          <p className="text-muted-foreground text-sm">{t('empty.message')}</p>
          <div className="mt-3">
            <Link className={NAV_LINK} href="/shop/products">
              {t('empty.browseProducts')}
            </Link>
          </div>
        </section>
      ) : (
        <section className="space-y-3" aria-label={t('table.caption')}>
          {rows.map(o => {
            const href = `/shop/orders/${o.id}`;
            const dateTime = o.createdAt.toISOString();
            const count = toCount(o.itemCount);
            const rawPrimary = o.primaryItemLabel?.trim() || null;
            const primary =
              rawPrimary && !looksLikeUuid(rawPrimary) ? rawPrimary : null;
            const headline = buildOrderHeadline(primary, count, o.id, t);
            const totalLabel = formatOrderTotal(
              o.totalAmount,
              o.currency,
              locale
            );

            return (
              <article
                key={o.id}
                className="border-border bg-background hover:bg-muted/10 rounded-xl border p-4 shadow-sm transition-colors sm:p-5"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-muted-foreground text-xs font-medium tracking-[0.16em] uppercase">
                      {t('card.orderNumber', { id: shortOrderId(o.id) })}
                    </p>

                    <Link
                      href={href}
                      className={cn(
                        ORDER_HEADLINE_LINK,
                        'mt-2 text-base leading-tight font-semibold sm:text-lg'
                      )}
                      title={headline}
                      aria-label={t('table.openOrder', { id: o.id })}
                    >
                      <span className="line-clamp-2">{headline}</span>
                    </Link>

                    <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      <span>{t('card.itemsCount', { count })}</span>
                      <time dateTime={dateTime}>
                        {t('card.placedOn', {
                          date: formatDateTime(o.createdAt, locale),
                        })}
                      </time>
                    </div>
                  </div>

                  <div className="flex flex-col items-start gap-3 sm:items-end sm:text-right">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap',
                        statusClassName(o.paymentStatus)
                      )}
                    >
                      {statusLabel(o.paymentStatus, t)}
                    </span>

                    <div>
                      <div className="text-muted-foreground text-xs tracking-[0.16em] uppercase">
                        {t('table.total')}
                      </div>
                      <div className="mt-1 text-base font-semibold">
                        {totalLabel}
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
