import { and, or, eq, inArray, isNull, lt, ne, sql } from 'drizzle-orm';

import { applyReserveMove, applyReleaseMove } from './inventory';
import { logError } from '@/lib/logging';
import { isPaymentsEnabled } from '@/lib/env/stripe';
import crypto from 'crypto';
import { db } from '@/db';
import {
  orderItems,
  orders,
  productPrices,
  products,
  inventoryMoves,
} from '@/db/schema/shop';

import {
  resolveCurrencyFromLocale,
  type CurrencyCode,
} from '@/lib/shop/currency';

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
  OrderSummaryWithMinor,
} from '@/lib/types/shop';
import { coercePriceFromDb } from '@/db/queries/shop/orders';
import {
  InsufficientStockError,
  IdempotencyConflictError,
  InvalidPayloadError,
  OrderNotFoundError,
  PriceConfigError,
  OrderStateInvalidError,
} from './errors';

import { type PaymentProvider, type PaymentStatus } from '@/lib/shop/payments';
import { MAX_QUANTITY_PER_LINE } from '@/lib/validation/shop';
import { createCartItemKey } from '@/lib/shop/cart-item-key';

type OrderRow = typeof orders.$inferSelect;

type CheckoutItemWithVariant = CheckoutItem & {
  selectedSize?: string | null;
  selectedColor?: string | null;
};

function normVariant(v?: string | null): string {
  const s = (v ?? '').trim();
  return s;
}

type DbClient = typeof db;
type OrderItemForSummary = {
  productId: string;
  selectedSize: string;
  selectedColor: string;
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
  selectedSize: orderItems.selectedSize,
  selectedColor: orderItems.selectedColor,
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
function requireTotalCents(summary: OrderSummaryWithMinor): number {
  const v = summary.totalAmountMinor;
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(
      'Order summary missing totalAmountMinor (server invariant violated).'
    );
  }
  return v;
}

function mergeCheckoutItems(items: CheckoutItem[]): CheckoutItem[] {
  const map = new Map<string, CheckoutItemWithVariant>();

  for (const item of items) {
    const it = item as CheckoutItemWithVariant;
    const selectedSize = normVariant(it.selectedSize);
    const selectedColor = normVariant(it.selectedColor);
    const key = createCartItemKey(item.productId, selectedSize, selectedColor);

    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...it, selectedSize, selectedColor });
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

function aggregateReserveByProductId(
  items: Array<{ productId: string; quantity: number }>
): Array<{ productId: string; quantity: number }> {
  const agg = new Map<string, number>();
  for (const it of items) {
    agg.set(it.productId, (agg.get(it.productId) ?? 0) + it.quantity);
  }
  return Array.from(agg.entries())
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => a.productId.localeCompare(b.productId));
}

function hashIdempotencyRequest(params: {
  items: CheckoutItemWithVariant[];
  currency: string;
  userId: string | null;
}) {
  // Stable canonical form:
  const normalized = [...params.items]
    .map(i => ({
      productId: i.productId,
      quantity: i.quantity,
      selectedSize: normVariant(i.selectedSize),
      selectedColor: normVariant(i.selectedColor),
    }))
    .sort((a, b) => {
      const ka = createCartItemKey(
        a.productId,
        a.selectedSize ?? undefined,
        a.selectedColor ?? undefined
      );
      const kb = createCartItemKey(
        b.productId,
        b.selectedSize ?? undefined,
        b.selectedColor ?? undefined
      );
      return ka.localeCompare(kb);
    });

  const payload = JSON.stringify({
    v: 1,
    currency: params.currency,
    userId: params.userId,
    items: normalized,
  });

  return crypto.createHash('sha256').update(payload).digest('hex');
}

function isStrictNonNegativeInt(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
  );
}

function requireMinor(
  value: unknown,
  ctx: { orderId: string; field: string }
): number {
  if (isStrictNonNegativeInt(value)) return value;

  throw new OrderStateInvalidError(
    `Order ${ctx.orderId} has invalid minor units in field "${ctx.field}"`,
    { orderId: ctx.orderId, field: ctx.field, rawValue: value }
  );
}

function parseOrderSummary(
  order: OrderRow,
  items: OrderItemForSummary[]
): OrderSummaryWithMinor {
  function readLegacyMoneyCentsOrThrow(
    value: unknown,
    ctx: { orderId: string; field: string }
  ): number {
    try {
      return fromDbMoney(value);
    } catch {
      throw new OrderStateInvalidError(
        `Order ${ctx.orderId} has invalid legacy money in field "${ctx.field}"`,
        { orderId: ctx.orderId, field: ctx.field, rawValue: value }
      );
    }
  }

  const normalizedItems = items.map(item => {
    const unitPriceMinorMaybe = item.unitPriceMinor;
    const unitPriceMinor =
      unitPriceMinorMaybe === null || unitPriceMinorMaybe === undefined
        ? readLegacyMoneyCentsOrThrow(item.unitPrice, {
            orderId: order.id,
            field: 'order_items.unitPrice',
          })
        : requireMinor(unitPriceMinorMaybe, {
            orderId: order.id,
            field: 'order_items.unitPriceMinor',
          });

    const lineTotalMinorMaybe = item.lineTotalMinor;
    const lineTotalMinor =
      lineTotalMinorMaybe === null || lineTotalMinorMaybe === undefined
        ? readLegacyMoneyCentsOrThrow(item.lineTotal, {
            orderId: order.id,
            field: 'order_items.lineTotal',
          })
        : requireMinor(lineTotalMinorMaybe, {
            orderId: order.id,
            field: 'order_items.lineTotalMinor',
          });

    return {
      productId: item.productId,
      productTitle: item.productTitle ?? '',
      productSlug: item.productSlug ?? '',
      selectedSize: item.selectedSize ?? '',
      selectedColor: item.selectedColor ?? '',
      quantity: item.quantity,

      // canonical:
      unitPriceMinor,
      lineTotalMinor,

      // display/legacy:
      unitPrice: fromCents(unitPriceMinor),
      lineTotal: fromCents(lineTotalMinor),
    };
  });

  const totalAmountMinor =
    order.totalAmountMinor == null
      ? readLegacyMoneyCentsOrThrow(order.totalAmount, {
          orderId: order.id,
          field: 'orders.totalAmount',
        })
      : requireMinor(order.totalAmountMinor, {
          orderId: order.id,
          field: 'orders.totalAmountMinor',
        });

  const paymentProvider = resolvePaymentProvider(order);

  if (paymentProvider === 'none' && order.paymentIntentId) {
    throw new OrderStateInvalidError(
      `Order ${order.id} is inconsistent: paymentProvider=none but paymentIntentId is set`,
      { orderId: order.id }
    );
  }

  return {
    id: order.id,
    // canonical:
    totalAmountMinor,
    // display/legacy:
    totalAmount: fromCents(totalAmountMinor),
    currency: order.currency,
    paymentStatus: order.paymentStatus,
    paymentProvider,
    paymentIntentId: order.paymentIntentId ?? undefined,
    createdAt: order.createdAt,
    items: normalizedItems,
  };
}

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

  // Only reconcile "no payments" workflow.
  if (provider !== 'none') return getOrderById(orderId);

  if (row.paymentIntentId) {
    throw new OrderStateInvalidError(
      `Order ${orderId} is inconsistent: paymentProvider=none but paymentIntentId is set`,
      { orderId }
    );
  }

  // IMPORTANT:
  // With DB CHECK, provider='none' cannot use pending/requires_payment.
  // Therefore paymentStatus is not a reliable "finality" signal here.
  // Finality is inventory-driven: if inventory is reserved, the order is complete.
  if (row.inventoryStatus === 'reserved') {
    return getOrderById(orderId);
  }

  // If it was already released/restocked - treat as failed.
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
        paymentStatus: 'paid',
        failureCode: null,
        failureMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));

    return getOrderById(orderId);
  } catch (e) {
    const failAt = new Date();
    await db
      .update(orders)
      .set({ inventoryStatus: 'release_pending', updatedAt: failAt })
      .where(eq(orders.id, orderId));

    for (const item of itemsToReserve) {
      try {
        await applyReleaseMove(orderId, item.productId, item.quantity);
      } catch (releaseErr) {
        logError(
          `[reconcileNoPaymentOrder] release failed orderId=${orderId} productId=${item.productId} quantity=${item.quantity}`,
          releaseErr
        );
      }
    }

    const isOos = e instanceof InsufficientStockError;
    await db
      .update(orders)
      .set({
        status: 'INVENTORY_FAILED',
        inventoryStatus: 'released',
        paymentStatus: 'failed',
        failureCode: isOos ? 'OUT_OF_STOCK' : 'INTERNAL_ERROR',
        failureMessage: isOos
          ? e.message
          : 'Checkout failed after reservation attempt.',
        stockRestored: true,
        restockedAt: failAt,
        updatedAt: failAt,
      })
      .where(eq(orders.id, orderId));

    throw e;
  }
}

async function getOrderByIdempotencyKey(
  dbClient: DbClient,
  key: string
): Promise<OrderSummaryWithMinor | null> {
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
  items: CheckoutItemWithVariant[],
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
    if (product.priceMinor !== null && product.priceMinor !== undefined) {
      if (
        !isStrictNonNegativeInt(product.priceMinor) ||
        product.priceMinor <= 0
      ) {
        throw new InvalidPayloadError('Product pricing is misconfigured.');
      }
      unitPriceCents = product.priceMinor;
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
  const paymentProvider = paymentsEnabled ? 'stripe' : 'none';
  // IMPORTANT: DB CHECK requires provider=none => payment_status in ('paid','failed')
  const paymentStatus = paymentsEnabled ? 'requires_payment' : 'paid';

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

    // currency mismatch => hard conflict
    if (row.currency !== currency) {
      throw new IdempotencyConflictError(
        'Idempotency key already used with different currency.',
        { existingCurrency: row.currency, requestCurrency: currency }
      );
    }

    // If DB hash is missing (legacy), derive from persisted state (order_items + order currency + userId)
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
      // best-effort: backfill for future strict checks
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
          console.warn(
            '[assertIdempotencyCompatible] idempotencyRequestHash backfill failed',
            { orderId: row.id },
            e
          );
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
      // Best-effort cleanup if inventory was left reserved due to crash.
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

  // 1) idempotency read
  const existing = await getOrderByIdempotencyKey(db, idempotencyKey);
  if (existing) {
    await assertIdempotencyCompatible(existing);
    // If payments are disabled, we must guarantee a final consistent state
    // (previous run could have crashed after order insert).
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

  // 3) pricing (read-only)
  const uniqueProductIds = Array.from(
    new Set(normalizedItems.map(i => i.productId))
  );
  const dbProducts = await getProductsForCheckout(uniqueProductIds, currency);

  if (dbProducts.length !== uniqueProductIds.length) {
    throw new InvalidPayloadError('Some products are unavailable or inactive.');
  }

  const productMap = new Map(dbProducts.map(p => [p.id, p]));
  const pricedItems = priceItems(normalizedItems, productMap, currency);
  const orderTotalCents = sumLineTotals(pricedItems.map(i => i.lineTotalCents));

  // 4) create order skeleton (CREATED/none)
  let orderId: string;
  try {
    const [created] = await db
      .insert(orders)
      .values({
        totalAmountMinor: orderTotalCents,
        totalAmount: toDbMoney(orderTotalCents),

        currency,
        paymentStatus,
        paymentProvider,
        paymentIntentId: null,

        // new workflow fields:
        status: 'CREATED',
        // IMPORTANT (no-payments): payment_status must be 'paid' due to DB CHECK,
        // so we must track in-progress via inventory_status.
        inventoryStatus: paymentsEnabled ? 'none' : 'reserving',
        failureCode: null,
        failureMessage: null,
        idempotencyRequestHash: requestHash,

        // legacy/idempotency:
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
        // IMPORTANT: in race conditions, we MUST still enforce hash/currency compatibility
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

  // 5) upsert order_items (requires UNIQUE(order_id, product_id, selected_size, selected_color))
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

  // stock is per-product => reserve aggregated by productId across variants
  const itemsToReserve = aggregateReserveByProductId(
    pricedItems.map(i => ({ productId: i.productId, quantity: i.quantity }))
  );

  try {
    // 7) reserve inventory (idempotent + atomic in inventory.ts)
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

    // 8) success
    await db
      .update(orders)
      .set({
        status: paymentsEnabled ? 'INVENTORY_RESERVED' : 'PAID',
        inventoryStatus: 'reserved',
        paymentStatus: paymentsEnabled ? 'pending' : 'paid',
        failureCode: null,
        failureMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));
  } catch (e) {
    const failAt = new Date();
    await db
      .update(orders)
      .set({ inventoryStatus: 'release_pending', updatedAt: failAt })
      .where(eq(orders.id, orderId));

    // best-effort release
    for (const it of itemsToReserve) {
      try {
        await applyReleaseMove(orderId, it.productId, it.quantity);
      } catch (releaseErr) {
        logError(
          `[createOrderWithItems] release failed orderId=${orderId} productId=${it.productId} quantity=${it.quantity}`,
          releaseErr
        );
      }
    }

    const isOos = e instanceof InsufficientStockError;
    await db
      .update(orders)
      .set({
        status: 'INVENTORY_FAILED',
        inventoryStatus: 'released',
        paymentStatus: 'failed',
        failureCode: isOos ? 'OUT_OF_STOCK' : 'INTERNAL_ERROR',
        failureMessage: isOos
          ? e.message
          : 'Checkout failed after reservation attempt.',
        stockRestored: true,
        restockedAt: failAt,
        updatedAt: failAt,
      })
      .where(eq(orders.id, orderId));

    throw e;
  }

  const order = await getOrderById(orderId);
  return { order, isNew: true, totalCents: orderTotalCents };
}

async function getOrderItems(orderId: string) {
  return db
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

  const items = await getOrderItems(id);
  return parseOrderSummary(order, items);
}

export async function getOrderSummary(
  id: string
): Promise<OrderSummaryWithMinor> {
  return getOrderById(id);
}

export async function setOrderPaymentIntent({
  orderId,
  paymentIntentId,
}: {
  orderId: string;
  paymentIntentId: string;
}): Promise<OrderSummaryWithMinor> {
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
    const items = await getOrderItems(orderId);
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

  const items = await getOrderItems(orderId);
  return parseOrderSummary(updated, items);
}

type RestockReason = 'failed' | 'refunded' | 'canceled' | 'stale';
type RestockOptions = {
  reason?: RestockReason;
  /** If caller already claimed the order (e.g. sweep), skip local claim. */
  alreadyClaimed?: boolean;
  /** Lease TTL for restock claim */
  claimTtlMinutes?: number;
  /** Who is claiming (trace/debug) */
  workerId?: string;
};

async function tryClaimRestockLease(params: {
  orderId: string;
  workerId: string;
  claimTtlMinutes: number;
}): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(Date.now() + params.claimTtlMinutes * 60 * 1000);

  const [row] = await db
    .update(orders)
    .set({
      sweepClaimedAt: now,
      sweepClaimExpiresAt: expiresAt,
      sweepRunId: crypto.randomUUID(),
      sweepClaimedBy: params.workerId,
      updatedAt: now,
    })
    .where(
      and(
        eq(orders.id, params.orderId),
        eq(orders.stockRestored, false),
        // claim gate: only unclaimed or expired claims can be claimed
        or(
          isNull(orders.sweepClaimExpiresAt),
          lt(orders.sweepClaimExpiresAt, now)
        )
      )
    )
    .returning({ id: orders.id });

  return !!row;
}

export async function restockOrder(
  orderId: string,
  options?: RestockOptions
): Promise<void> {
  const reason = options?.reason;

  const [order] = await db
    .select({
      id: orders.id,
      paymentProvider: orders.paymentProvider,
      paymentStatus: orders.paymentStatus,
      inventoryStatus: orders.inventoryStatus,
      stockRestored: orders.stockRestored,
      restockedAt: orders.restockedAt,
      failureCode: orders.failureCode,
      failureMessage: orders.failureMessage,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order) throw new OrderNotFoundError('Order not found');

  const isNoPayment = order.paymentProvider === 'none';

  // already released / legacy idempotency
  if (
    order.inventoryStatus === 'released' ||
    order.stockRestored ||
    order.restockedAt !== null
  )
    return;

  // If state says "none" we still may have reserve moves (crash between reserve and status update).
  const reservedMoves = await db
    .select({
      productId: inventoryMoves.productId,
      quantity: inventoryMoves.quantity,
    })
    .from(inventoryMoves)
    .where(
      and(
        eq(inventoryMoves.orderId, orderId),
        eq(inventoryMoves.type, 'reserve')
      )
    );

  if (!reservedMoves.length) {
    // Nothing was reserved. For no-payments orders this is an "orphan" that must become terminal.
    if (
      isNoPayment &&
      (reason === 'failed' || reason === 'canceled' || reason === 'stale')
    ) {
      const now = new Date();
      await db
        .update(orders)
        .set({
          status: 'INVENTORY_FAILED',
          inventoryStatus: 'released',
          paymentStatus: 'failed',
          failureCode: order.failureCode ?? 'STALE_ORPHAN',
          failureMessage:
            order.failureMessage ??
            'Orphan order: no inventory reservation was recorded.',
          stockRestored: true,
          restockedAt: now,
          updatedAt: now,
        })
        .where(eq(orders.id, orderId));
      return;
    }

    // Stripe (or any non-none provider): stale orphan must become terminal, иначе sweep будет подбирать снова.
    if (reason === 'stale') {
      const now = new Date();
      await db
        .update(orders)
        .set({
          status: 'INVENTORY_FAILED',
          inventoryStatus: 'released',
          paymentStatus: 'failed',
          failureCode: order.failureCode ?? 'STALE_ORPHAN',
          failureMessage:
            order.failureMessage ??
            'Orphan order: no inventory reservation was recorded.',
          stockRestored: true,
          restockedAt: now,
          updatedAt: now,
        })
        .where(eq(orders.id, orderId));
      return;
    }

    return;
  }

  // safety: paid can only be released via refund
  // IMPORTANT: for payment_provider='none', payment_status='paid' is not a finality signal
  // (forced by DB CHECK). Finality is inventory_status='reserved'.
  if (!isNoPayment && order.paymentStatus === 'paid' && reason !== 'refunded') {
    throw new OrderStateInvalidError(
      `Cannot restock a paid order without refund reason.`,
      { orderId, details: { reason, paymentStatus: order.paymentStatus } }
    );
  }
  // If we have reserved moves, we must claim a lease to avoid concurrent double-processing.
  // (Actual stock safety is guaranteed by inventory_moves move_key, but lease prevents wasted work
  // and prevents "restocked_at" churn under concurrency.)
  const claimTtlMinutes = options?.claimTtlMinutes ?? 5;
  const workerId = options?.workerId ?? 'restock';
  if (!options?.alreadyClaimed) {
    const claimed = await tryClaimRestockLease({
      orderId,
      workerId,
      claimTtlMinutes,
    });
    if (!claimed) return; // someone else is processing
  }
  const now = new Date();

  await db
    .update(orders)
    .set({ inventoryStatus: 'release_pending', updatedAt: now })
    .where(and(eq(orders.id, orderId), ne(orders.inventoryStatus, 'released')));

  for (const item of reservedMoves)
    await applyReleaseMove(orderId, item.productId, item.quantity);
  // FINALIZE ONCE: only one caller may flip stock_restored/restocked_at
  // If RETURNING is empty => already finalized by another worker (or previous attempt).
  const finalizedAt = new Date();
  const [finalized] = await db
    .update(orders)
    .set({
      stockRestored: true,
      restockedAt: finalizedAt,
      updatedAt: finalizedAt,
    })
    .where(and(eq(orders.id, orderId), eq(orders.stockRestored, false)))
    .returning({ id: orders.id });

  if (!finalized) return;

  let normalizedStatus: PaymentStatus | undefined;
  if (reason === 'refunded') normalizedStatus = 'refunded';
  else if (reason === 'failed' || reason === 'canceled' || reason === 'stale')
    normalizedStatus = 'failed';
  const shouldCancel = reason === 'canceled';
  const shouldFail = reason === 'failed' || reason === 'stale';
  await db
    .update(orders)
    .set({
      inventoryStatus: 'released',
      updatedAt: now,
      ...(normalizedStatus ? { paymentStatus: normalizedStatus } : {}),
      ...(shouldFail ? { status: 'INVENTORY_FAILED' } : {}),
      ...(shouldCancel ? { status: 'CANCELED' } : {}),
    })
    .where(eq(orders.id, orderId));
}

export async function restockStalePendingOrders(options?: {
  olderThanMinutes?: number;
  batchSize?: number;
  orderIds?: string[];
  claimTtlMinutes?: number; // claim TTL window
  workerId?: string; // identify who claimed
  timeBudgetMs?: number; // max runtime budget for this sweep
}): Promise<number> {
  const MIN_OLDER_MIN = 10;
  const MAX_OLDER_MIN = 60 * 24 * 7;
  const MIN_BATCH = 25;
  const MAX_BATCH = 100;
  const MIN_CLAIM_TTL = 1;
  const MAX_CLAIM_TTL = 60;

  const DEFAULT_TIME_BUDGET_MS = 20_000;
  const MIN_TIME_BUDGET_MS = 0;
  const MAX_TIME_BUDGET_MS = 25_000;

  const olderThanMinutesRaw = options?.olderThanMinutes ?? 60;
  const batchSizeRaw = options?.batchSize ?? 50;
  const claimTtlMinutesRaw = options?.claimTtlMinutes ?? 5;

  const workerId =
    (options?.workerId ?? 'restock-sweep').trim() || 'restock-sweep';

  const olderThanMinutes = Math.max(
    MIN_OLDER_MIN,
    Math.min(MAX_OLDER_MIN, Math.floor(Number(olderThanMinutesRaw)))
  );

  const batchSize = Math.max(
    MIN_BATCH,
    Math.min(MAX_BATCH, Math.floor(Number(batchSizeRaw)))
  );

  const claimTtlMinutes = Math.max(
    MIN_CLAIM_TTL,
    Math.min(MAX_CLAIM_TTL, Math.floor(Number(claimTtlMinutesRaw)))
  );

  const timeBudgetMs = Math.max(
    MIN_TIME_BUDGET_MS,
    Math.min(
      MAX_TIME_BUDGET_MS,
      Math.floor(Number(options?.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS))
    )
  );
  const deadlineMs = Date.now() + timeBudgetMs;

  // If explicitly provided empty list => nothing to do (test helper).
  if (options?.orderIds && options.orderIds.length === 0) return 0;

  const hasExplicitIds = Boolean(options?.orderIds?.length);
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);

  let processed = 0;
  const runId = crypto.randomUUID();

  while (true) {
    if (Date.now() >= deadlineMs) break;

    const now = new Date();
    const claimExpiresAt = new Date(Date.now() + claimTtlMinutes * 60 * 1000);

    const baseConditions = [
      eq(orders.paymentProvider, 'stripe'),
      inArray(orders.paymentStatus, [
        'pending',
        'requires_payment',
      ] as PaymentStatus[]),
      eq(orders.stockRestored, false),
      isNull(orders.restockedAt),
      ne(orders.inventoryStatus, 'released'),
      // claim gate: only unclaimed or expired claims are eligible
      or(
        isNull(orders.sweepClaimExpiresAt),
        lt(orders.sweepClaimExpiresAt, now)
      ),
    ];

    // If not targeting specific orders, apply age cutoff.
    if (!hasExplicitIds) {
      baseConditions.push(lt(orders.createdAt, cutoff));
    }

    if (hasExplicitIds && options?.orderIds?.length) {
      baseConditions.push(inArray(orders.id, options.orderIds));
    }

    const claimable = db
      .select({ id: orders.id })
      .from(orders)
      .where(and(...baseConditions))
      .orderBy(orders.createdAt)
      .limit(batchSize);

    const claimed = await db
      .update(orders)
      .set({
        sweepClaimedAt: now,
        sweepClaimExpiresAt: claimExpiresAt,
        sweepRunId: runId,
        sweepClaimedBy: workerId,
        updatedAt: now,
      })
      .where(
        and(
          inArray(orders.id, claimable),
          or(
            isNull(orders.sweepClaimExpiresAt),
            lt(orders.sweepClaimExpiresAt, now)
          )
        )
      )
      .returning({ id: orders.id });

    if (!claimed.length) break;

    for (const { id } of claimed) {
      if (Date.now() >= deadlineMs) break;

      await restockOrder(id, {
        reason: 'stale',
        alreadyClaimed: true,
        workerId,
      });
      processed += 1;
    }
  }

  return processed;
}

// Cleanup for orders stuck in "reserving" phase (inventory reservation started but never completed).
export async function restockStuckReservingOrders(options?: {
  olderThanMinutes?: number;
  batchSize?: number;
  claimTtlMinutes?: number;
  workerId?: string;
  timeBudgetMs?: number;
}): Promise<number> {
  const MIN_OLDER_MIN = 10;
  const MAX_OLDER_MIN = 60 * 24 * 7;
  const MIN_BATCH = 25;
  const MAX_BATCH = 100;
  const MIN_CLAIM_TTL = 1;
  const MAX_CLAIM_TTL = 60;

  const DEFAULT_TIME_BUDGET_MS = 20_000;
  const MIN_TIME_BUDGET_MS = 0;
  const MAX_TIME_BUDGET_MS = 25_000;

  const olderThanMinutes = Math.max(
    MIN_OLDER_MIN,
    Math.min(MAX_OLDER_MIN, Math.floor(Number(options?.olderThanMinutes ?? 15)))
  );

  const batchSize = Math.max(
    MIN_BATCH,
    Math.min(MAX_BATCH, Math.floor(Number(options?.batchSize ?? 50)))
  );

  const claimTtlMinutes = Math.max(
    MIN_CLAIM_TTL,
    Math.min(MAX_CLAIM_TTL, Math.floor(Number(options?.claimTtlMinutes ?? 5)))
  );

  const workerId =
    (options?.workerId ?? 'restock-stuck-reserving-sweep').trim() ||
    'restock-stuck-reserving-sweep';

  const timeBudgetMs = Math.max(
    MIN_TIME_BUDGET_MS,
    Math.min(
      MAX_TIME_BUDGET_MS,
      Math.floor(Number(options?.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS))
    )
  );
  const deadlineMs = Date.now() + timeBudgetMs;

  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);

  let processed = 0;
  const runId = crypto.randomUUID();

  while (true) {
    if (Date.now() >= deadlineMs) break;

    const now = new Date();
    const claimExpiresAt = new Date(Date.now() + claimTtlMinutes * 60 * 1000);

    const baseConditions = [
      // Only Stripe flow here; no-payments has its own sweep.
      eq(orders.paymentProvider, 'stripe'),

      // "still in progress" payment states
      inArray(orders.paymentStatus, [
        'pending',
        'requires_payment',
      ] as PaymentStatus[]),

      // stuck in reserving/releasing phase (not final)
      inArray(orders.inventoryStatus, [
        'reserving',
        'release_pending',
      ] as const),

      // not already restocked/finalized
      eq(orders.stockRestored, false),
      isNull(orders.restockedAt),

      // age cutoff
      lt(orders.createdAt, cutoff),

      // claim gate
      or(
        isNull(orders.sweepClaimExpiresAt),
        lt(orders.sweepClaimExpiresAt, now)
      ),
    ];

    const claimable = db
      .select({ id: orders.id })
      .from(orders)
      .where(and(...baseConditions))
      .orderBy(orders.createdAt)
      .limit(batchSize);

    const claimed = await db
      .update(orders)
      .set({
        sweepClaimedAt: now,
        sweepClaimExpiresAt: claimExpiresAt,
        sweepRunId: runId,
        sweepClaimedBy: workerId,
        // set failure details only if absent (keeps real error if it already exists)
        failureCode: sql`coalesce(${orders.failureCode}, 'STUCK_RESERVING_TIMEOUT')`,
        failureMessage: sql`coalesce(${orders.failureMessage}, 'Order timed out while reserving inventory.')`,
        updatedAt: now,
      })
      .where(
        and(
          inArray(orders.id, claimable),
          or(
            isNull(orders.sweepClaimExpiresAt),
            lt(orders.sweepClaimExpiresAt, now)
          )
        )
      )
      .returning({ id: orders.id });

    if (!claimed.length) break;

    for (const { id } of claimed) {
      if (Date.now() >= deadlineMs) break;

      // IMPORTANT: reuse hardened exactly-once restock
      await restockOrder(id, {
        reason: 'stale',
        alreadyClaimed: true,
        workerId,
      });

      processed += 1;
    }
  }

  return processed;
}

// Cleanup for payment_provider='none' flow where payment_status may be 'paid' before inventory reservation completes.
export async function restockStaleNoPaymentOrders(options?: {
  olderThanMinutes?: number;
  batchSize?: number;
  claimTtlMinutes?: number;
  workerId?: string;
  timeBudgetMs?: number;
}): Promise<number> {
  const MIN_OLDER_MIN = 10;
  const MAX_OLDER_MIN = 60 * 24 * 7;
  const MIN_BATCH = 25;
  const MAX_BATCH = 100;
  const MIN_CLAIM_TTL = 1;
  const MAX_CLAIM_TTL = 60;

  const DEFAULT_TIME_BUDGET_MS = 20_000;
  const MIN_TIME_BUDGET_MS = 0;
  const MAX_TIME_BUDGET_MS = 25_000;

  const olderThanMinutes = Math.max(
    MIN_OLDER_MIN,
    Math.min(MAX_OLDER_MIN, Math.floor(Number(options?.olderThanMinutes ?? 30)))
  );

  const batchSize = Math.max(
    MIN_BATCH,
    Math.min(MAX_BATCH, Math.floor(Number(options?.batchSize ?? 50)))
  );

  const claimTtlMinutes = Math.max(
    MIN_CLAIM_TTL,
    Math.min(MAX_CLAIM_TTL, Math.floor(Number(options?.claimTtlMinutes ?? 5)))
  );

  const workerId =
    (options?.workerId ?? 'restock-nopay-sweep').trim() ||
    'restock-nopay-sweep';

  const timeBudgetMs = Math.max(
    MIN_TIME_BUDGET_MS,
    Math.min(
      MAX_TIME_BUDGET_MS,
      Math.floor(Number(options?.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS))
    )
  );
  const deadlineMs = Date.now() + timeBudgetMs;

  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);

  let processed = 0;
  const runId = crypto.randomUUID();

  while (true) {
    if (Date.now() >= deadlineMs) break;

    const now = new Date();
    const claimExpiresAt = new Date(Date.now() + claimTtlMinutes * 60 * 1000);

    const baseConditions = [
      eq(orders.paymentProvider, 'none'),
      eq(orders.stockRestored, false),
      isNull(orders.restockedAt),
      lt(orders.createdAt, cutoff),

      inArray(orders.inventoryStatus, [
        'none',
        'reserving',
        'release_pending',
      ] as const),

      // claim gate
      or(
        isNull(orders.sweepClaimExpiresAt),
        lt(orders.sweepClaimExpiresAt, now)
      ),
    ];

    const claimable = db
      .select({ id: orders.id })
      .from(orders)
      .where(and(...baseConditions))
      .orderBy(orders.createdAt)
      .limit(batchSize);

    const claimed = await db
      .update(orders)
      .set({
        sweepClaimedAt: now,
        sweepClaimExpiresAt: claimExpiresAt,
        sweepRunId: runId,
        sweepClaimedBy: workerId,
        updatedAt: now,
      })
      .where(
        and(
          inArray(orders.id, claimable),
          or(
            isNull(orders.sweepClaimExpiresAt),
            lt(orders.sweepClaimExpiresAt, now)
          )
        )
      )
      .returning({ id: orders.id });

    if (!claimed.length) break;

    for (const { id } of claimed) {
      if (Date.now() >= deadlineMs) break;

      await restockOrder(id, {
        reason: 'stale', // reuse existing terminalization semantics
        alreadyClaimed: true,
        workerId,
      });

      processed += 1;
    }
  }

  return processed;
}

export async function refundOrder(
  orderId: string
): Promise<OrderSummaryWithMinor> {
  const [order] = await db
    .select({
      id: orders.id,
      paymentProvider: orders.paymentProvider,
      paymentIntentId: orders.paymentIntentId,
      paymentStatus: orders.paymentStatus,
      stockRestored: orders.stockRestored,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order) throw new OrderNotFoundError('Order not found');
  const provider = resolvePaymentProvider(order);
  if (provider !== 'stripe') {
    throw new InvalidPayloadError(
      'Refunds are only supported for stripe orders.'
    );
  }

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

  const items = await getOrderItems(orderId);
  const summary = parseOrderSummary(updatedOrder, items);

  if (!order.stockRestored) {
    await restockOrder(orderId, { reason: 'refunded' });
  }

  return summary;
}

export { restockOrder as restock };
