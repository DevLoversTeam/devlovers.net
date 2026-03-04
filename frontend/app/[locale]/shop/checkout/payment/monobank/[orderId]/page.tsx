import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ClearCartOnMount } from '@/components/shop/ClearCartOnMount';
import { Link } from '@/i18n/routing';
import { OrderNotFoundError } from '@/lib/services/errors';
import { getOrderSummary } from '@/lib/services/orders';
import { formatMoney } from '@/lib/shop/currency';
import {
  SHOP_FOCUS,
  SHOP_OUTLINE_BTN_BASE,
  SHOP_OUTLINE_BTN_INTERACTIVE,
} from '@/lib/shop/ui-classes';
import { cn } from '@/lib/utils';
import { orderIdParamSchema } from '@/lib/validation/shop';

import MonobankGooglePayClient from '../MonobankGooglePayClient';

type SearchParams = Record<string, string | string[] | undefined>;

type PaymentPageProps = {
  params: Promise<{ locale: string; orderId: string }>;
  searchParams?: Promise<SearchParams>;
};

export const metadata: Metadata = {
  title: 'Monobank Google Pay | DevLovers',
  description: 'Complete your payment with Google Pay via Monobank.',
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SHOP_OUTLINE_BTN = cn(
  SHOP_OUTLINE_BTN_BASE,
  SHOP_OUTLINE_BTN_INTERACTIVE,
  SHOP_FOCUS
);

function getStringParam(params: SearchParams | undefined, key: string): string {
  const raw = params?.[key];
  if (!raw) return '';
  if (Array.isArray(raw)) return raw[0] ?? '';
  return raw;
}

function parseStatusToken(params: SearchParams | undefined): string | null {
  const value = getStringParam(params, 'statusToken').trim();
  return value.length ? value : null;
}

function shouldClearCart(params: SearchParams | undefined): boolean {
  const value = getStringParam(params, 'clearCart');
  return value === '1' || value === 'true';
}

function parseOrderId(rawOrderId: string): string | null {
  const parsed = orderIdParamSchema.safeParse({ id: rawOrderId });
  if (!parsed.success) return null;
  return parsed.data.id;
}

export default async function MonobankGooglePayPage(props: PaymentPageProps) {
  const { locale, orderId: rawOrderId } = await props.params;
  const searchParams = props.searchParams ? await props.searchParams : undefined;

  const t = await getTranslations('shop.checkout');
  const orderId = parseOrderId(rawOrderId);
  const statusToken = parseStatusToken(searchParams);
  const clearCart = shouldClearCart(searchParams);

  if (!orderId) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <section className="border-border bg-card rounded-lg border p-8 text-center">
          <h1 className="text-foreground text-2xl font-bold">
            {t('errors.invalidOrder')}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {t('missingOrder.message')}
          </p>
          <div className="mt-6 flex justify-center">
            <Link href="/shop/cart" className={SHOP_OUTLINE_BTN}>
              {t('actions.backToCart')}
            </Link>
          </div>
        </section>
      </main>
    );
  }

  let order: Awaited<ReturnType<typeof getOrderSummary>> | null = null;
  let loadState: 'ok' | 'not_found' | 'error' = 'ok';

  try {
    order = await getOrderSummary(orderId);
  } catch (error) {
    loadState = error instanceof OrderNotFoundError ? 'not_found' : 'error';
  }

  if (loadState === 'not_found') {
    return (
      <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <section className="border-border bg-card rounded-lg border p-8 text-center">
          <h1 className="text-foreground text-2xl font-bold">
            {t('errors.orderNotFound')}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {t('notFoundOrder.message')}
          </p>
          <div className="mt-6 flex justify-center">
            <Link href="/shop/cart" className={SHOP_OUTLINE_BTN}>
              {t('actions.backToCart')}
            </Link>
          </div>
        </section>
      </main>
    );
  }

  if (loadState === 'error' || !order) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <section className="border-border bg-card rounded-lg border p-8 text-center">
          <h1 className="text-foreground text-2xl font-bold">
            {t('errors.unableToLoad')}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {t('errors.tryAgainLater')}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <ClearCartOnMount enabled={clearCart} />

      <section className="border-border bg-card rounded-lg border p-8">
        <p className="text-accent text-sm font-semibold tracking-wide uppercase">
          {t('payment.title')}
        </p>

        <h1 className="text-foreground mt-2 text-3xl font-bold">
          {t('payment.payForOrder', { orderId: order.id.slice(0, 8) })}
        </h1>

        <p className="text-muted-foreground mt-2 text-sm">
          {t('monobankGooglePay.supportedDevices')}
        </p>

        <div className="border-border bg-muted/30 mt-6 rounded-md border p-4">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">
              {t('payment.amountDue')}
            </span>
            <span className="text-foreground text-xl font-bold">
              {formatMoney(order.totalAmountMinor, order.currency, locale)}
            </span>
          </div>
          <p className="text-muted-foreground mt-1 text-xs tracking-wide uppercase">
            {order.currency}
          </p>
        </div>

        <div className="mt-6">
          <MonobankGooglePayClient orderId={order.id} statusToken={statusToken} />
        </div>
      </section>
    </main>
  );
}
