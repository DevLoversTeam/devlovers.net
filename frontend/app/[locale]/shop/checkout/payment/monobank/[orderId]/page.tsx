import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import {
  CheckoutNoticePage,
  CheckoutPageShell,
} from '@/components/shop/checkout/CheckoutPageShell';
import { ClearCartOnMount } from '@/components/shop/ClearCartOnMount';
import { Link } from '@/i18n/routing';
import { getCheckoutPaymentPageOrderSummary } from '@/lib/services/orders';
import {
  type CheckoutSearchParams,
  parseCheckoutOrderId,
  parseStatusToken,
  shouldClearCart,
} from '@/lib/shop/checkout-search-params';
import { formatMoney } from '@/lib/shop/currency';
import {
  SHOP_FOCUS,
  SHOP_OUTLINE_BTN_BASE,
  SHOP_OUTLINE_BTN_INTERACTIVE,
} from '@/lib/shop/ui-classes';
import { cn } from '@/lib/utils';

import MonobankGooglePayClient from '../MonobankGooglePayClient';

type PaymentPageProps = {
  params: Promise<{ locale: string; orderId: string }>;
  searchParams?: Promise<CheckoutSearchParams>;
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

export default async function MonobankGooglePayPage(props: PaymentPageProps) {
  const { locale, orderId: rawOrderId } = await props.params;
  const searchParams = props.searchParams ? await props.searchParams : undefined;

  const t = await getTranslations('shop.checkout');
  const orderId = parseCheckoutOrderId(rawOrderId);
  const statusToken = parseStatusToken(searchParams);
  const clearCart = shouldClearCart(searchParams);

  if (!orderId) {
    return (
      <CheckoutNoticePage
        title={t('errors.invalidOrder')}
        description={t('missingOrder.message')}
      >
        <div className="mt-6 flex justify-center">
          <Link href="/shop/cart" className={SHOP_OUTLINE_BTN}>
            {t('actions.backToCart')}
          </Link>
        </div>
      </CheckoutNoticePage>
    );
  }

  const orderAccess = await getCheckoutPaymentPageOrderSummary({
    orderId,
    statusToken,
  });

  if (!orderAccess.ok) {
    if (orderAccess.code === 'STATUS_TOKEN_MISCONFIGURED') {
      return (
        <CheckoutNoticePage
          title={t('errors.unableToLoad')}
          description={t('errors.tryAgainLater')}
        />
      );
    }

    return (
      <CheckoutNoticePage
        title={t('errors.orderNotFound')}
        description={t('notFoundOrder.message')}
      >
        <div className="mt-6 flex justify-center">
          <Link href="/shop/cart" className={SHOP_OUTLINE_BTN}>
            {t('actions.backToCart')}
          </Link>
        </div>
      </CheckoutNoticePage>
    );
  }
  const order = orderAccess.order;

  return (
    <CheckoutPageShell>
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
    </CheckoutPageShell>
  );
}
