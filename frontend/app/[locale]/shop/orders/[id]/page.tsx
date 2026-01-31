import 'server-only';
import { cn } from '@/lib/utils';
import { Link } from '@/i18n/routing';
import { notFound, redirect } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';

import { db } from '@/db';
import { orderItems, orders } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { orderIdParamSchema } from '@/lib/validation/shop';
import { logError } from '@/lib/logging';
import { formatMoney, type CurrencyCode } from '@/lib/shop/currency';
import { fromDbMoney } from '@/lib/shop/money';
import {
  SHOP_FOCUS,
  SHOP_LINK_BASE,
  SHOP_LINK_MD,
  SHOP_NAV_LINK_BASE,
} from '@/lib/shop/ui-classes';

export const dynamic = 'force-dynamic';

type OrderCurrency = (typeof orders.$inferSelect)['currency'];
type OrderPaymentStatus = (typeof orders.$inferSelect)['paymentStatus'];
type OrderPaymentProvider = (typeof orders.$inferSelect)['paymentProvider'];

type OrderDetail = {
  id: string;
  userId: string | null;
  totalAmount: string;
  currency: OrderCurrency;
  paymentStatus: OrderPaymentStatus;
  paymentProvider: OrderPaymentProvider;
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

function safeFormatMoneyMajor(
  major: string,
  currency: CurrencyCode,
  locale: string
): string {
  try {
    return formatMoney(fromDbMoney(major), currency, locale);
  } catch {
    return `${major} ${currency}`;
  }
}

function safeFormatDateTime(iso: string, dtf: Intl.DateTimeFormat): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return dtf.format(d);
}

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
  const t = await getTranslations('shop.orders.detail');

  const user = await getCurrentUser();
  if (!user) {
    redirect(
      `/${locale}/login?returnTo=${encodeURIComponent(
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

  const currency: CurrencyCode = order.currency === 'UAH' ? 'UAH' : 'USD';
  const dtf = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const totalFormatted = safeFormatMoneyMajor(
    order.totalAmount,
    currency,
    locale
  );
  const createdFormatted = safeFormatDateTime(order.createdAt, dtf);
  const restockedFormatted = order.restockedAt
    ? safeFormatDateTime(order.restockedAt, dtf)
    : '—';
  const NAV_LINK = cn(SHOP_NAV_LINK_BASE, 'text-lg', SHOP_FOCUS);

  const PRODUCT_LINK = cn(
    SHOP_LINK_BASE,
    SHOP_LINK_MD,
    SHOP_FOCUS,
    'truncate',
    '!underline !decoration-2 !underline-offset-4'
  );

  return (
    <main
      className="mx-auto w-full max-w-3xl px-4 py-8"
      aria-labelledby="order-heading"
    >
      <header className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 id="order-heading" className="truncate text-2xl font-semibold">
            {t('title')}
          </h1>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {order.id}
          </div>
        </div>

        <nav
          className="flex flex-wrap items-center justify-end gap-3"
          aria-label="Order navigation"
        >
          <Link className={NAV_LINK} href="/shop/orders">
            {t('myOrders')}
          </Link>
          <Link className={NAV_LINK} href="/shop">
            {t('shop')}
          </Link>
        </nav>
      </header>

      <section
        className="mb-6 rounded-md border border-border p-4"
        aria-labelledby="order-summary-heading"
      >
        <h2 id="order-summary-heading" className="sr-only">
          {t('orderSummary')}
        </h2>

        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">{t('total')}</dt>
            <dd className="text-sm font-medium">{totalFormatted}</dd>
          </div>

          <div>
            <dt className="text-xs text-muted-foreground">
              {t('paymentStatus')}
            </dt>
            <dd className="text-sm font-medium">
              {String(order.paymentStatus)}
            </dd>
          </div>

          <div>
            <dt className="text-xs text-muted-foreground">{t('created')}</dt>
            <dd className="text-sm">{createdFormatted}</dd>
          </div>

          {isAdmin && (
            <div>
              <dt className="text-xs text-muted-foreground">{t('provider')}</dt>
              <dd className="text-sm">{String(order.paymentProvider)}</dd>
            </div>
          )}
        </dl>

        {isAdmin && (
          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">
                {t('paymentReference')}
              </dt>
              <dd className="text-sm break-all">
                {order.paymentIntentId ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                {t('idempotencyKey')}
              </dt>
              <dd className="text-sm break-all">{order.idempotencyKey}</dd>
            </div>
          </dl>
        )}

        {isAdmin && (
          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">
                {t('stockRestored')}
              </dt>
              <dd className="text-sm">
                {order.stockRestored ? t('yes') : t('no')}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                {t('restockedAt')}
              </dt>
              <dd className="text-sm">{restockedFormatted}</dd>
            </div>
          </dl>
        )}
      </section>

      <section
        className="rounded-md border border-border"
        aria-labelledby="order-items-heading"
      >
        <div className="border-b border-border p-4">
          <h2 id="order-items-heading" className="text-lg font-semibold">
            {t('items')}
          </h2>
        </div>

        <ul className="divide-y divide-border" aria-label={t('items')}>
          {order.items.map(it => (
            <li key={it.id} className="p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  {it.productSlug ? (
                    <Link
                      href={`/shop/products/${it.productSlug}`}
                      className={PRODUCT_LINK}
                    >
                      {it.productTitle ??
                        it.productSlug ??
                        it.productSku ??
                        it.productId}
                    </Link>
                  ) : (
                    <div className="truncate font-medium">
                      {it.productTitle ?? it.productSku ?? it.productId}
                    </div>
                  )}

                  <div className="mt-1 break-all text-xs text-muted-foreground">
                    {it.productSku
                      ? t('sku', { sku: it.productSku })
                      : t('product', { productId: it.productId })}
                  </div>
                </div>

                <dl className="flex flex-col items-start gap-1 sm:items-end">
                  <div>
                    <dt className="sr-only">{t('quantity')}</dt>
                    <dd className="text-sm">Qty: {it.quantity}</dd>
                  </div>
                  <div>
                    <dt className="sr-only">{t('unitPrice')}</dt>
                    <dd className="text-sm text-muted-foreground">
                      Unit:{' '}
                      {safeFormatMoneyMajor(it.unitPrice, currency, locale)}
                    </dd>
                  </div>
                  <div>
                    <dt className="sr-only">{t('lineTotal')}</dt>
                    <dd className="text-sm font-medium">
                      Line:{' '}
                      {safeFormatMoneyMajor(it.lineTotal, currency, locale)}
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
