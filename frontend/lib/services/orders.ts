import { and, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';

import { isPaymentsEnabled } from '@/lib/env/stripe';

import { db } from '@/db';
import { orderItems, orders, productPrices, products } from '@/db/schema';
import type { CurrencyCode } from '@/lib/shop/currency';
import {
  calculateLineTotal,
  fromCents,
  fromDbMoney,
  sumLineTotals,
  toDbMoney,
} from '@/lib/shop/money';
import {
  CheckoutItem,
  CheckoutResult,
  OrderDetail,
  OrderSummary,
  PaymentStatus,
} from '@/lib/types/shop';
import { coercePriceFromDb } from '@/db/queries/shop/orders';
import {
  InsufficientStockError,
  InvalidPayloadError,
  OrderNotFoundError,
  PriceConfigError,
} from './errors';
import type { PaymentProvider } from '@/lib/types/shop';
import { MAX_QUANTITY_PER_LINE } from '@/lib/validation/shop';

type OrderRow = typeof orders.$inferSelect;

type DbClient = typeof db;
type DbTransaction = Parameters<DbClient['transaction']>[0] extends (
  tx: infer T
) => unknown
  ? T
  : DbClient;
type DbOrTx = DbClient | DbTransaction;

type OrderItemForSummary = {
  productId: string;
  quantity: number;
  unitPrice: unknown;
  lineTotal: unknown;
  unitPriceMinor: unknown;
  lineTotalMinor: unknown;
  productTitle: string | null;
  productSlug: string | null;
};

const orderItemSummarySelection = {
  productId: orderItems.productId,
  quantity: orderItems.quantity,
  unitPrice: orderItems.unitPrice,
  lineTotal: orderItems.lineTotal,
  unitPriceMinor: orderItems.unitPriceMinor,
  lineTotalMinor: orderItems.lineTotalMinor,
  productTitle: sql<
    string | null
  >`coalesce(${orderItems.productTitle}, ${products.title})`,
  productSlug: sql<
    string | null
  >`coalesce(${orderItems.productSlug}, ${products.slug})`,
};

function resolvePaymentProvider(
  order: Pick<OrderRow, 'paymentProvider' | 'paymentIntentId' | 'paymentStatus'>
): PaymentProvider {
  const provider = order.paymentProvider;

  if (provider === 'stripe' || provider === 'none') return provider;

  // legacy / corrupted data fallback:
  if (order.paymentIntentId) return 'stripe';
  if (order.paymentStatus === 'paid') return 'none';

  // safest default: treat as stripe to avoid skipping payment flows
  return 'stripe';
}

type Currency = CurrencyCode;

function requireTotalCents(summary: OrderSummary): number {
  const cents = (summary as { totalCents?: unknown }).totalCents;
  if (typeof cents !== 'number' || !Number.isFinite(cents)) {
    throw new Error(
      'Order summary missing totalCents (server invariant violated).'
    );
  }
  return cents;
}

function mergeCheckoutItems(items: CheckoutItem[]): CheckoutItem[] {
  const map = new Map<string, CheckoutItem>();

  for (const item of items) {
    const key = `${item.productId}::${item.selectedSize ?? ''}::${
      item.selectedColor ?? ''
    }`;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...item });
      continue;
    }
    const mergedQty = existing.quantity + item.quantity;
    if (mergedQty > MAX_QUANTITY_PER_LINE) {
      throw new InvalidPayloadError('Quantity exceeds maximum per line.');
    }
    existing.quantity = mergedQty;
  }

  return Array.from(map.values());
}

function readMinor(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.trunc(value);
}

function parseOrderSummary(
  order: OrderRow,
  items: OrderItemForSummary[]
): OrderSummary {
  const normalizedItems = items.map(item => {
    const unitPriceCents =
      readMinor(item.unitPriceMinor) ?? fromDbMoney(item.unitPrice);
    const lineTotalCents =
      readMinor(item.lineTotalMinor) ?? fromDbMoney(item.lineTotal);

    return {
      unitPriceCents,
      lineTotalCents,
      productId: item.productId,
      productTitle: item.productTitle ?? '',
      productSlug: item.productSlug ?? '',
      quantity: item.quantity,
      unitPrice: fromCents(unitPriceCents),
      lineTotal: fromCents(lineTotalCents),
    };
  });

  const totalCents =
    readMinor(
      (order as unknown as { totalAmountMinor?: unknown }).totalAmountMinor
    ) ?? fromDbMoney(order.totalAmount);

  const paymentProvider = resolvePaymentProvider(order);

  if (paymentProvider === 'none' && order.paymentIntentId) {
    throw new Error(
      `Order ${order.id} is inconsistent: paymentProvider=none but paymentIntentId is set`
    );
  }

  return {
    id: order.id,
    totalCents,
    totalAmount: fromCents(totalCents),
    currency: order.currency,
    paymentStatus: order.paymentStatus,
    paymentProvider,
    paymentIntentId: order.paymentIntentId ?? undefined,
    createdAt: order.createdAt,
    items: normalizedItems,
  };
}

async function getOrderByIdempotencyKey(
  dbClient: DbClient,
  key: string
): Promise<OrderSummary | null> {
  const [order] = await dbClient
    .select()
    .from(orders)
    .where(eq(orders.idempotencyKey, key))
    .limit(1);
  if (!order) return null;

  const items = await dbClient
    .select(orderItemSummarySelection)
    .from(orderItems)
    .leftJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, order.id));

  return parseOrderSummary(order, items);
}

async function getProductsForCheckout(
  productIds: string[],
  currency: Currency
) {
  if (!productIds.length) return [];

  return db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      stock: products.stock,
      sku: products.sku,

      // canonical price (minor)
      priceMinor: productPrices.priceMinor,

      // legacy fallback (keep for safety during rollout)
      price: productPrices.price,

      originalPrice: productPrices.originalPrice,
      priceCurrency: productPrices.currency,
      isActive: products.isActive,
    })
    .from(products)
    .leftJoin(
      productPrices,
      and(
        eq(productPrices.productId, products.id),
        eq(productPrices.currency, currency)
      )
    )
    .where(and(eq(products.isActive, true), inArray(products.id, productIds)));
}

type CheckoutProductRow = Awaited<
  ReturnType<typeof getProductsForCheckout>
>[number];

function priceItems(
  items: CheckoutItem[],
  productMap: Map<string, CheckoutProductRow>,
  currency: Currency
) {
  return items.map(item => {
    const product = productMap.get(item.productId);

    if (!product) {
      throw new InvalidPayloadError('Some products are unavailable.');
    }
    //Price must exist for requested currency.
    // With leftJoin, missing row => priceCurrency null and both price fields null.
    if (
      !product.priceCurrency ||
      (product.priceMinor == null && product.price == null)
    ) {
      throw new PriceConfigError('Price not configured for currency.', {
        productId: product.id,
        currency,
      });
    }

    // canonical: int minor
    let unitPriceCents: number | null = null;
    if (
      typeof product.priceMinor === 'number' &&
      Number.isFinite(product.priceMinor)
    ) {
      unitPriceCents = Math.trunc(product.priceMinor);
    }

    // safety fallback (should become dead code after migration + dual-write stabilizes)
    if (unitPriceCents == null) {
      const unitPrice = coercePriceFromDb(product.price, {
        field: 'price',
        productId: product.id,
      });
      if (unitPrice <= 0) {
        throw new InvalidPayloadError('Product pricing is misconfigured.');
      }
      unitPriceCents = Math.round(unitPrice * 100);
    }

    if (unitPriceCents <= 0) {
      throw new InvalidPayloadError('Product pricing is misconfigured.');
    }

    const lineTotalCents = calculateLineTotal(unitPriceCents, item.quantity);
    const normalizedUnitPrice = fromCents(unitPriceCents);
    const lineTotal = fromCents(lineTotalCents);

    return {
      productId: product.id,
      quantity: item.quantity,
      unitPrice: normalizedUnitPrice,
      unitPriceCents,
      lineTotal,
      lineTotalCents,
      stock: product.stock,
      productTitle: product.title,
      productSlug: product.slug,
      productSku: product.sku,
    };
  });
}

async function persistOrder({
  items,
  currency,
  totalCents,
  idempotencyKey,
  userId,
}: {
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    unitPriceCents: number;
    lineTotal: number;
    lineTotalCents: number;
    stock: number;
    productTitle: string | null | undefined;
    productSlug: string | null | undefined;
    productSku: string | null | undefined;
  }>;
  currency: Currency;
  totalCents: number;
  idempotencyKey: string;
  userId?: string | null;
}): Promise<OrderSummary> {
  const paymentsEnabled = isPaymentsEnabled();
  const paymentProvider: PaymentProvider = paymentsEnabled ? 'stripe' : 'none';
  const paymentStatus: PaymentStatus = paymentsEnabled ? 'pending' : 'paid';

  const summary = await db.transaction(async tx => {
    for (const item of items) {
      const [updated] = await tx
        .update(products)
        .set({ stock: sql`${products.stock} - ${item.quantity}` })
        .where(
          and(
            eq(products.id, item.productId),
            gte(products.stock, item.quantity)
          )
        )
        .returning({ stock: products.stock });

      if (!updated) {
        throw new InsufficientStockError(
          `Insufficient stock for product ${item.productId}`
        );
      }
    }

    const [createdOrder] = await tx
      .insert(orders)
      .values({
        // canonical
        totalAmountMinor: totalCents,

        // legacy mirror
        totalAmount: toDbMoney(totalCents),

        currency,
        paymentStatus,
        paymentProvider,
        paymentIntentId: null,
        stockRestored: false,
        restockedAt: null,
        idempotencyKey,
        userId: userId ?? null,
      })
      .returning();

    if (!createdOrder) {
      throw new Error('Failed to create order');
    }

    if (items.length) {
      await tx.insert(orderItems).values(
        items.map(item => ({
          orderId: createdOrder.id,
          productId: item.productId,
          quantity: item.quantity,

          // canonical
          unitPriceMinor: item.unitPriceCents,
          lineTotalMinor: item.lineTotalCents,

          // legacy mirror
          unitPrice: toDbMoney(item.unitPriceCents),
          lineTotal: toDbMoney(item.lineTotalCents),

          productTitle: item.productTitle ?? null,
          productSlug: item.productSlug ?? null,
          productSku: item.productSku ?? null,
        }))
      );
    }

    const orderItemsResult = await getOrderItems(tx, createdOrder.id);
    return parseOrderSummary(createdOrder, orderItemsResult);
  });

  return summary;
}

export async function createOrderWithItems({
  items,
  idempotencyKey,
  userId,
  currency,
}: {
  items: CheckoutItem[];
  idempotencyKey: string;
  userId?: string | null;
  currency: Currency;
}): Promise<CheckoutResult> {
  const existing = await getOrderByIdempotencyKey(db, idempotencyKey);
  if (existing) {
    return {
      order: existing,
      isNew: false,
      totalCents: requireTotalCents(existing),
    };
  }

  const normalizedItems = mergeCheckoutItems(items);

  const uniqueProductIds = Array.from(
    new Set(normalizedItems.map(i => i.productId))
  );
  const dbProducts = await getProductsForCheckout(uniqueProductIds, currency);

  if (dbProducts.length !== uniqueProductIds.length) {
    // leftJoin: this mismatch only means product missing/inactive (NOT missing price).
    // Missing price is handled in priceItems() as PriceConfigError (422).
    throw new InvalidPayloadError('Some products are unavailable or inactive.');
  }

  const productMap = new Map(dbProducts.map(p => [p.id, p]));
  const pricedItems = priceItems(normalizedItems, productMap, currency);
  const orderTotalCents = sumLineTotals(pricedItems.map(i => i.lineTotalCents));

  try {
    const order = await persistOrder({
      items: pricedItems,
      currency,
      totalCents: orderTotalCents,
      idempotencyKey,
      userId: userId ?? null,
    });

    return { order, isNew: true, totalCents: orderTotalCents };
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      const existingOrder = await getOrderByIdempotencyKey(db, idempotencyKey);
      if (existingOrder) {
        return {
          order: existingOrder,
          isNew: false,
          totalCents: requireTotalCents(existingOrder),
        };
      }
    }
    throw error;
  }
}

async function getOrderItems(dbOrTx: DbOrTx, orderId: string) {
  return dbOrTx
    .select(orderItemSummarySelection)
    .from(orderItems)
    .leftJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, orderId));
}

export async function getOrderById(id: string): Promise<OrderDetail> {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, id))
    .limit(1);
  if (!order) throw new OrderNotFoundError('Order not found');

  const items = await getOrderItems(db, id);
  return parseOrderSummary(order, items);
}

export async function getOrderSummary(id: string): Promise<OrderSummary> {
  return getOrderById(id);
}

export async function setOrderPaymentIntent({
  orderId,
  paymentIntentId,
}: {
  orderId: string;
  paymentIntentId: string;
}): Promise<OrderSummary> {
  const [existing] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!existing) throw new OrderNotFoundError('Order not found');

  const provider = resolvePaymentProvider(existing);

  if (provider !== 'stripe') {
    throw new InvalidPayloadError(
      'Payment intent can only be set for stripe orders.'
    );
  }

  const allowed: PaymentStatus[] = ['pending', 'requires_payment'];
  if (!allowed.includes(existing.paymentStatus as PaymentStatus)) {
    throw new InvalidPayloadError(
      'Order cannot accept a payment intent from the current status.'
    );
  }

  if (
    existing.paymentIntentId &&
    existing.paymentIntentId !== paymentIntentId
  ) {
    throw new InvalidPayloadError(
      'Order already has a different payment intent.'
    );
  }

  if (existing.paymentIntentId === paymentIntentId) {
    const items = await getOrderItems(db, orderId);
    return parseOrderSummary(existing, items);
  }

  const [updated] = await db
    .update(orders)
    .set({
      paymentIntentId,
      paymentStatus: 'requires_payment',
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId))
    .returning();

  if (!updated) throw new Error('Failed to update order payment intent');

  const items = await getOrderItems(db, orderId);
  return parseOrderSummary(updated, items);
}

async function restockOrderInTx(
  tx: DbTransaction,
  orderId: string,
  reason?: 'failed' | 'refunded' | 'canceled' | 'stale'
) {
  const [order] = await tx
    .select({
      id: orders.id,
      paymentStatus: orders.paymentStatus,
      stockRestored: orders.stockRestored,
      restockedAt: orders.restockedAt,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1)
    .for('update');

  if (!order) throw new OrderNotFoundError('Order not found');
  if (order.stockRestored || order.restockedAt !== null) return;

  const items = await tx
    .select({ productId: orderItems.productId, quantity: orderItems.quantity })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  const now = new Date();

  for (const item of items) {
    await tx
      .update(products)
      .set({ stock: sql`${products.stock} + ${item.quantity}` })
      .where(eq(products.id, item.productId));
  }

  let normalizedStatus: PaymentStatus | undefined;
  if (reason === 'refunded') normalizedStatus = 'refunded';
  else if (reason === 'failed' || reason === 'canceled' || reason === 'stale')
    normalizedStatus = 'failed';

  await tx
    .update(orders)
    .set({
      stockRestored: true,
      restockedAt: now,
      updatedAt: now,
      ...(normalizedStatus ? { paymentStatus: normalizedStatus } : {}),
    })
    .where(eq(orders.id, orderId));
}

export async function restockOrder(
  orderId: string,
  options?: {
    reason?: 'failed' | 'refunded' | 'canceled' | 'stale';
    tx?: DbTransaction;
  }
): Promise<void> {
  const { reason, tx } = options ?? {};
  if (tx) {
    await restockOrderInTx(tx, orderId, reason);
    return;
  }
  await db.transaction(async transaction => {
    await restockOrderInTx(transaction, orderId, reason);
  });
}

export async function restockStalePendingOrders(options?: {
  olderThanMinutes?: number;
}): Promise<number> {
  const olderThanMinutes = options?.olderThanMinutes ?? 60;
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);

  const staleOrders = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        inArray(orders.paymentStatus, [
          'pending',
          'requires_payment',
        ] as PaymentStatus[]),
        eq(orders.stockRestored, false),
        isNull(orders.restockedAt),
        lt(orders.createdAt, cutoff)
      )
    );

  let processed = 0;
  for (const staleOrder of staleOrders) {
    await restockOrder(staleOrder.id, { reason: 'stale' });
    processed += 1;
  }

  return processed;
}

export async function refundOrder(orderId: string): Promise<OrderSummary> {
  const [order] = await db
    .select({
      id: orders.id,
      paymentStatus: orders.paymentStatus,
      stockRestored: orders.stockRestored,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order) throw new OrderNotFoundError('Order not found');

  const refundableStatuses: PaymentStatus[] = ['paid'];
  if (!refundableStatuses.includes(order.paymentStatus as PaymentStatus)) {
    throw new InvalidPayloadError(
      'Order cannot be refunded from the current status.'
    );
  }

  const [updatedOrder] = await db
    .update(orders)
    .set({ paymentStatus: 'refunded', updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning();

  if (!updatedOrder) throw new Error('Failed to update order status');

  const items = await getOrderItems(db, orderId);
  const summary = parseOrderSummary(updatedOrder, items);

  if (!order.stockRestored) {
    await restockOrder(orderId, { reason: 'refunded' });
  }

  return summary;
}

export { restockOrder as restock };
