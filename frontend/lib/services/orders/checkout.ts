import { and, eq, inArray, ne, sql } from 'drizzle-orm';

import { db } from '@/db';
import { coercePriceFromDb } from '@/db/queries/shop/orders';
import { orderItems, orders, productPrices, products } from '@/db/schema/shop';
import { isPaymentsEnabled } from '@/lib/env/stripe';
import { logError, logWarn } from '@/lib/logging';
import { resolveCurrencyFromLocale } from '@/lib/shop/currency';
import {
  calculateLineTotal,
  fromCents,
  sumLineTotals,
  toDbMoney,
} from '@/lib/shop/money';
import { type PaymentProvider, type PaymentStatus } from '@/lib/shop/payments';
import {
  type CheckoutItem,
  type CheckoutResult,
  type OrderSummaryWithMinor,
} from '@/lib/types/shop';

import {
  IdempotencyConflictError,
  InsufficientStockError,
  InvalidPayloadError,
  InvalidVariantError,
  OrderNotFoundError,
  OrderStateInvalidError,
  PriceConfigError,
} from '../errors';
import { applyReserveMove } from '../inventory';
import {
  aggregateReserveByProductId,
  type CheckoutItemWithVariant,
  type Currency,
  hashIdempotencyRequest,
  isStrictNonNegativeInt,
  mergeCheckoutItems,
  normVariant,
  requireTotalCents,
  resolvePaymentProvider,
} from './_shared';
import { guardedPaymentStatusUpdate } from './payment-state';
<<<<<<< HEAD
=======
import { restockOrder } from './restock';
import { getOrderById, getOrderByIdempotencyKey } from './summary';
>>>>>>> 601e032c399164dfc128ab2dee5fe52dd66d2caf

async function reconcileNoPaymentOrder(
  orderId: string
): Promise<OrderSummaryWithMinor> {
  const [row] = await db
    .select({
      id: orders.id,
      paymentStatus: orders.paymentStatus,
      paymentProvider: orders.paymentProvider,
      paymentIntentId: orders.paymentIntentId,
      inventoryStatus: orders.inventoryStatus,
      stockRestored: orders.stockRestored,
      restockedAt: orders.restockedAt,
      failureCode: orders.failureCode,
      failureMessage: orders.failureMessage,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!row) throw new OrderNotFoundError('Order not found');

  const provider = resolvePaymentProvider({
    paymentProvider: row.paymentProvider,
    paymentIntentId: row.paymentIntentId,
    paymentStatus: row.paymentStatus as PaymentStatus,
  });

  if (provider !== 'none') return getOrderById(orderId);

  if (row.paymentIntentId) {
    throw new OrderStateInvalidError(
      `Order ${orderId} is inconsistent: paymentProvider=none but paymentIntentId is set`,
      { orderId }
    );
  }

  if (row.inventoryStatus === 'reserved') {
    return getOrderById(orderId);
  }

  if (row.inventoryStatus === 'release_pending') {
    try {
      await restockOrder(orderId, {
        reason: 'failed',
        workerId: 'reconcileNoPaymentOrder',
      });
    } catch (restockErr) {
      logError(
        `[reconcileNoPaymentOrder] restock failed orderId=${orderId}`,
        restockErr
      );
    }

    throw new InsufficientStockError(
      row.failureMessage ?? 'Order cannot be completed (release pending).'
    );
  }
  if (
    row.inventoryStatus === 'released' ||
    row.stockRestored ||
    row.restockedAt !== null
  ) {
    throw new InsufficientStockError(
      'Order cannot be completed (stock restored).'
    );
  }

  const items = await db
    .select({
      productId: orderItems.productId,
      quantity: orderItems.quantity,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  if (!items.length) {
    throw new InvalidPayloadError('Order has no items.');
  }

  const now = new Date();
  await db
    .update(orders)
    .set({ inventoryStatus: 'reserving', updatedAt: now })
    .where(
      and(
        eq(orders.id, orderId),
        ne(orders.inventoryStatus, 'reserved'),
        ne(orders.inventoryStatus, 'released')
      )
    );

  const itemsToReserve = aggregateReserveByProductId(items);

  try {
    for (const item of itemsToReserve) {
      const res = await applyReserveMove(
        orderId,
        item.productId,
        item.quantity
      );
      if (!res.ok) {
        throw new InsufficientStockError(
          `Insufficient stock for product ${item.productId}`
        );
      }
    }

    await db
      .update(orders)
      .set({
        status: 'PAID',
        inventoryStatus: 'reserved',
        failureCode: null,
        failureMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));

    const payRes = await guardedPaymentStatusUpdate({
      orderId,
      paymentProvider: 'none',
      to: 'paid',
      source: 'checkout',
    });

    if (!payRes.applied && payRes.reason !== 'ALREADY_IN_STATE') {
      throw new OrderStateInvalidError(
        'Order paymentStatus transition blocked after reservation.',
        { orderId, details: { reason: payRes.reason, from: payRes.from } }
      );
    }

    return getOrderById(orderId);
  } catch (e) {
    const failAt = new Date();
    const isOos = e instanceof InsufficientStockError;

    await db
      .update(orders)
      .set({
        status: 'INVENTORY_FAILED',
        inventoryStatus: 'release_pending',
        failureCode: isOos ? 'OUT_OF_STOCK' : 'INTERNAL_ERROR',
        failureMessage: isOos
          ? e.message
          : 'Checkout failed after reservation attempt.',
        updatedAt: failAt,
      })
      .where(eq(orders.id, orderId));

    try {
      await restockOrder(orderId, {
        reason: 'failed',
        workerId: 'reconcileNoPaymentOrder',
      });
    } catch (restockErr) {
      logError(
        `[reconcileNoPaymentOrder] restock failed orderId=${orderId}`,
        restockErr
      );
    }

    throw e;
  }
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

      colors: products.colors,
      sizes: products.sizes,

      priceMinor: productPrices.priceMinor,

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

function parseVariantList(raw: unknown): string[] {
  if (raw == null) return [];

  if (Array.isArray(raw)) {
    const out = raw.map(x => normVariant(String(x))).filter(x => x.length > 0);
    return Array.from(new Set(out));
  }

  if (typeof raw !== 'string') {
    return [];
  }

  const v0 = raw.trim();
  if (!v0) return [];

  if (v0.startsWith('[')) {
    try {
      const parsed = JSON.parse(v0);
      if (Array.isArray(parsed)) {
        const out = parsed
          .map(x => normVariant(String(x)))
          .filter(x => x.length > 0);
        return Array.from(new Set(out));
      }
    } catch {
      // Intentionally empty: fall through to delimiter-based parsing
    }
  }

  const v =
    v0.startsWith('{') && v0.endsWith('}')
      ? v0.slice(1, -1).replace(/"/g, '')
      : v0;

  const out = v
    .split(/[,;\n\r]+/g)
    .map(x => normVariant(x))
    .filter(x => x.length > 0);

  return Array.from(new Set(out));
}

function priceItems(
  items: CheckoutItemWithVariant[],
  productMap: Map<string, CheckoutProductRow>,
  currency: Currency
) {
  return items.map(item => {
    const product = productMap.get(item.productId);

    if (!product) {
      throw new InvalidPayloadError('Some products are unavailable.');
    }
    if (
      !product.priceCurrency ||
      (product.priceMinor == null && product.price == null)
    ) {
      throw new PriceConfigError('Price not configured for currency.', {
        productId: product.id,
        currency,
      });
    }

    let unitPriceCents: number | null = null;
    if (product.priceMinor !== null && product.priceMinor !== undefined) {
      if (
        !isStrictNonNegativeInt(product.priceMinor) ||
        product.priceMinor <= 0
      ) {
        throw new InvalidPayloadError('Product pricing is misconfigured.');
      }
      unitPriceCents = product.priceMinor;
    }
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
      selectedSize: normVariant(item.selectedSize),
      selectedColor: normVariant(item.selectedColor),
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

export async function createOrderWithItems({
  items,
  idempotencyKey,
  userId,
  locale,
}: {
  items: CheckoutItem[];
  idempotencyKey: string;
  userId?: string | null;
  locale: string | null | undefined;
}): Promise<CheckoutResult> {
  const currency: Currency = resolveCurrencyFromLocale(locale);
  const paymentsEnabled = isPaymentsEnabled();
  const paymentProvider: PaymentProvider = paymentsEnabled ? 'stripe' : 'none';

  const initialPaymentStatus: PaymentStatus =
    paymentProvider === 'none' ? 'paid' : 'pending';

  const normalizedItems = mergeCheckoutItems(
    items
  ) as CheckoutItemWithVariant[];
  const requestHash = hashIdempotencyRequest({
    items: normalizedItems,
    currency,
    userId: userId ?? null,
  });

  async function assertIdempotencyCompatible(existing: OrderSummaryWithMinor) {
    const [row] = await db
      .select({
        id: orders.id,
        currency: orders.currency,
        paymentStatus: orders.paymentStatus,
        paymentProvider: orders.paymentProvider,
        idempotencyRequestHash: orders.idempotencyRequestHash,
        failureMessage: orders.failureMessage,
        userId: orders.userId,
      })
      .from(orders)
      .where(eq(orders.id, existing.id))
      .limit(1);

    if (!row) throw new OrderNotFoundError('Order not found');

    if (row.currency !== currency) {
      throw new IdempotencyConflictError(
        'Idempotency key already used with different currency.',
        { existingCurrency: row.currency, requestCurrency: currency }
      );
    }

    const derivedExistingHash =
      row.idempotencyRequestHash ??
      hashIdempotencyRequest({
        items: (existing.items as any[]).map(i => ({
          productId: i.productId,
          quantity: i.quantity,
          selectedSize: normVariant((i as any).selectedSize),
          selectedColor: normVariant((i as any).selectedColor),
        })) as CheckoutItemWithVariant[],
        currency: row.currency,
        userId: (row.userId ?? null) as string | null,
      });

    if (!row.idempotencyRequestHash) {
      try {
        await db
          .update(orders)
          .set({
            idempotencyRequestHash: derivedExistingHash,
            updatedAt: new Date(),
          })
          .where(eq(orders.id, row.id));
      } catch (e) {
        if (process.env.DEBUG) {
          logWarn('checkout_rejected', {
            phase: 'idempotency_request_hash_backfill',
            orderId: row.id,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }

    if (derivedExistingHash !== requestHash) {
      throw new IdempotencyConflictError(undefined, {
        existingHash: derivedExistingHash,
        requestHash,
      });
    }

    if (row.paymentStatus === 'failed') {
      try {
        await restockOrder(existing.id, { reason: 'failed' });
      } catch (restockErr) {
        logError(
          `[assertIdempotencyCompatible] cleanup restock failed orderId=${existing.id}`,
          restockErr
        );
      }

      throw new InsufficientStockError(
        row.failureMessage ?? 'Insufficient stock.'
      );
    }
  }

  const existing = await getOrderByIdempotencyKey(db, idempotencyKey);
  if (existing) {
    await assertIdempotencyCompatible(existing);
    if (!paymentsEnabled) {
      const reconciled = await reconcileNoPaymentOrder(existing.id);
      return {
        order: reconciled,
        isNew: false,
        totalCents: requireTotalCents(reconciled),
      };
    }
    return {
      order: existing,
      isNew: false,
      totalCents: requireTotalCents(existing),
    };
  }
  const uniqueProductIds = Array.from(
    new Set(normalizedItems.map(i => i.productId))
  );
  const dbProducts = await getProductsForCheckout(uniqueProductIds, currency);

  if (dbProducts.length !== uniqueProductIds.length) {
    throw new InvalidPayloadError('Some products are unavailable or inactive.');
  }

  const productMap = new Map(dbProducts.map(p => [p.id, p]));
  const variantMap = new Map(
    dbProducts.map(p => [
      p.id,
      {
        allowedSizes: parseVariantList((p as any).sizes),
        allowedColors: parseVariantList((p as any).colors),
      },
    ])
  );

  for (const item of normalizedItems) {
    const cfg = variantMap.get(item.productId);
    if (!cfg) {
      throw new InvalidPayloadError(
        `Invariant violation: missing variant config for product ${item.productId} (normalizedItems=${normalizedItems.length}, uniqueProductIds=${uniqueProductIds.length}, dbProducts=${dbProducts.length}).`
      );
    }

    const selectedSize = normVariant(item.selectedSize ?? '');
    const selectedColor = normVariant(item.selectedColor ?? '');

    if (selectedSize) {
      if (
        cfg.allowedSizes.length === 0 ||
        !cfg.allowedSizes.includes(selectedSize)
      ) {
        throw new InvalidVariantError('Invalid size selection.', {
          productId: item.productId,
          field: 'selectedSize',
          value: selectedSize,
          allowed: cfg.allowedSizes,
        });
      }
    }

    if (selectedColor) {
      if (
        cfg.allowedColors.length === 0 ||
        !cfg.allowedColors.includes(selectedColor)
      ) {
        throw new InvalidVariantError('Invalid color selection.', {
          productId: item.productId,
          field: 'selectedColor',
          value: selectedColor,
          allowed: cfg.allowedColors,
        });
      }
    }
  }

  const pricedItems = priceItems(normalizedItems, productMap, currency);
  const orderTotalCents = sumLineTotals(pricedItems.map(i => i.lineTotalCents));

  let orderId: string;
  try {
    const [created] = await db
      .insert(orders)
      .values({
        totalAmountMinor: orderTotalCents,
        totalAmount: toDbMoney(orderTotalCents),

        currency,
        paymentStatus: initialPaymentStatus,
        paymentProvider,
        paymentIntentId: null,

        status: 'CREATED',

        inventoryStatus: paymentsEnabled ? 'none' : 'reserving',
        failureCode: null,
        failureMessage: null,
        idempotencyRequestHash: requestHash,

        stockRestored: false,
        restockedAt: null,
        idempotencyKey,
        userId: userId ?? null,
      })
      .returning({ id: orders.id });

    if (!created) throw new Error('Failed to create order');
    orderId = created.id;
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      const existingOrder = await getOrderByIdempotencyKey(db, idempotencyKey);
      if (existingOrder) {
        await assertIdempotencyCompatible(existingOrder);
        if (!paymentsEnabled) {
          const reconciled = await reconcileNoPaymentOrder(existingOrder.id);
          return {
            order: reconciled,
            isNew: false,
            totalCents: requireTotalCents(reconciled),
          };
        }
        return {
          order: existingOrder,
          isNew: false,
          totalCents: requireTotalCents(existingOrder),
        };
      }
    }
    throw error;
  }

  if (pricedItems.length) {
    await db
      .insert(orderItems)
      .values(
        pricedItems.map(item => ({
          orderId,
          productId: item.productId,
          selectedSize: item.selectedSize ?? '',
          selectedColor: item.selectedColor ?? '',
          quantity: item.quantity,

          unitPriceMinor: item.unitPriceCents,
          lineTotalMinor: item.lineTotalCents,

          unitPrice: toDbMoney(item.unitPriceCents),
          lineTotal: toDbMoney(item.lineTotalCents),

          productTitle: item.productTitle ?? null,
          productSlug: item.productSlug ?? null,
          productSku: item.productSku ?? null,
        }))
      )
      .onConflictDoUpdate({
        target: [
          orderItems.orderId,
          orderItems.productId,
          orderItems.selectedSize,
          orderItems.selectedColor,
        ],
        set: {
          quantity: sql`excluded.quantity`,
          unitPriceMinor: sql`excluded.unit_price_minor`,
          lineTotalMinor: sql`excluded.line_total_minor`,
          unitPrice: sql`excluded.unit_price`,
          lineTotal: sql`excluded.line_total`,
          productTitle: sql`excluded.product_title`,
          productSlug: sql`excluded.product_slug`,
          productSku: sql`excluded.product_sku`,
        },
      });
  }

  const now = new Date();
  await db
    .update(orders)
    .set({ inventoryStatus: 'reserving', updatedAt: now })
    .where(eq(orders.id, orderId));

  const itemsToReserve = aggregateReserveByProductId(
    pricedItems.map(i => ({ productId: i.productId, quantity: i.quantity }))
  );

  try {
    for (const item of itemsToReserve) {
      const res = await applyReserveMove(
        orderId,
        item.productId,
        item.quantity
      );
      if (!res.ok) {
        throw new InsufficientStockError(
          `Insufficient stock for product ${item.productId}`
        );
      }
    }

    await db
      .update(orders)
      .set({
        status: paymentsEnabled ? 'INVENTORY_RESERVED' : 'PAID',
        inventoryStatus: 'reserved',
        failureCode: null,
        failureMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));

    const targetPaymentStatus: PaymentStatus =
      paymentProvider === 'none' ? 'paid' : 'pending';

    const payRes = await guardedPaymentStatusUpdate({
      orderId,
      paymentProvider,
      to: targetPaymentStatus,
      source: 'checkout',
    });

    if (!payRes.applied && payRes.reason !== 'ALREADY_IN_STATE') {
      throw new OrderStateInvalidError(
        'Order paymentStatus transition blocked after inventory reservation.',
        {
          orderId,
          details: {
            reason: payRes.reason,
            from: payRes.from,
            to: targetPaymentStatus,
            paymentProvider,
          },
        }
      );
    }
  } catch (e) {
    const failAt = new Date();

    await db
      .update(orders)
      .set({ inventoryStatus: 'release_pending', updatedAt: failAt })
      .where(eq(orders.id, orderId));

    const isOos = e instanceof InsufficientStockError;

    await db
      .update(orders)
      .set({
        status: 'INVENTORY_FAILED',
        inventoryStatus: 'release_pending',
        failureCode: isOos ? 'OUT_OF_STOCK' : 'INTERNAL_ERROR',
        failureMessage: isOos
          ? e.message
          : 'Checkout failed after reservation attempt.',
        updatedAt: failAt,
      })
      .where(eq(orders.id, orderId));

    try {
      await restockOrder(orderId, {
        reason: 'failed',
        workerId: 'createOrderWithItems',
      });
    } catch (restockErr) {
      logError(
        `[createOrderWithItems] restock failed orderId=${orderId}`,
        restockErr
      );
    }

    throw e;
  }

  const order = await getOrderById(orderId);
  return { order, isNew: true, totalCents: orderTotalCents };
}
