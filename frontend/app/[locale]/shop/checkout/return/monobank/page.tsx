import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ClearCartOnMount } from '@/components/shop/ClearCartOnMount';
import { Link } from '@/i18n/routing';
import {
  type CheckoutSearchParams,
  getCheckoutSearchParam,
  parseCheckoutOrderId,
  parseStatusToken,
  shouldClearCart,
} from '@/lib/shop/checkout-search-params';
import {
  SHOP_FOCUS,
  SHOP_OUTLINE_BTN_BASE,
  SHOP_OUTLINE_BTN_INTERACTIVE,
} from '@/lib/shop/ui-classes';
import { cn } from '@/lib/utils';

import MonobankReturnStatus from './MonobankReturnStatus';

export const metadata: Metadata = {
  title: 'Monobank Payment Status | DevLovers',
  description: 'Waiting for Monobank webhook confirmation.',
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SHOP_OUTLINE_BTN = cn(
  SHOP_OUTLINE_BTN_BASE,
  SHOP_OUTLINE_BTN_INTERACTIVE,
  SHOP_FOCUS
);

export default async function MonobankReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<CheckoutSearchParams>;
}) {
  const { locale } = await params;
  const resolvedSearchParams = await searchParams;
  const t = await getTranslations('shop.checkout');

  const orderId = parseCheckoutOrderId(
    getCheckoutSearchParam(resolvedSearchParams, 'orderId')
  );
  const statusToken = parseStatusToken(resolvedSearchParams);
  const clearCart = shouldClearCart(resolvedSearchParams);

  if (!orderId) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <section className="border-border bg-card rounded-lg border p-8 text-center">
          <h1 className="text-foreground text-2xl font-bold">
            {t('errors.missingOrderId')}
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

  return (
    <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <ClearCartOnMount enabled={clearCart} />
      <MonobankReturnStatus
        orderId={orderId}
        statusToken={statusToken}
        locale={locale}
      />
    </main>
  );
}
