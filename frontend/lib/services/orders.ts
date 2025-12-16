import { and, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";

import { isPaymentsEnabled } from "@/lib/env/stripe";

import { requireDb } from "@/lib/db/client";
import { orderItems, orders, products } from "@/lib/db/schema";
import {
  calculateLineTotal,
  fromCents,
  fromDbMoney,
  sumLineTotals,
  toCents,
  toDbMoney,
} from "@/lib/shop/money";
import {
  CheckoutItem,
  CheckoutResult,
  OrderDetail,
  OrderSummary,
  PaymentStatus,
} from "@/lib/types/shop";
import { coercePriceFromDb } from "@/lib/db/orders";
import { currencyValues } from "@/lib/validation/shop";
import {
  InsufficientStockError,
  InvalidPayloadError,
  OrderNotFoundError,
} from "./errors";
import type { PaymentProvider } from "@/lib/types/shop";

type OrderRow = typeof orders.$inferSelect;

type DbClient = ReturnType<typeof requireDb>;
type DbTransaction = Parameters<DbClient["transaction"]>[0] extends (
  tx: infer T
) => any
  ? T
  : DbClient;
type DbOrTx = DbClient | DbTransaction;

type OrderItemForSummary = {
  productId: string;
  quantity: number;
  unitPrice: unknown;
  lineTotal: unknown;
  productTitle: string | null;
  productSlug: string | null;
};

const orderItemSummarySelection = {
  productId: orderItems.productId,
  quantity: orderItems.quantity,
  unitPrice: orderItems.unitPrice,
  lineTotal: orderItems.lineTotal,
  productTitle: sql<string | null>`coalesce(${orderItems.productTitle}, ${products.title})`,
  productSlug: sql<string | null>`coalesce(${orderItems.productSlug}, ${products.slug})`,
};

type Currency = (typeof currencyValues)[number];

function parseOrderSummary(
  order: OrderRow,
  items: OrderItemForSummary[]
): OrderSummary {
  const normalizedItems = items.map((item) => {
    const unitPriceCents = fromDbMoney(item.unitPrice);
    const lineTotalCents = fromDbMoney(item.lineTotal);

    return {
      unitPriceCents,
      lineTotalCents,
      productId: item.productId,
      productTitle: item.productTitle ?? "",
      productSlug: item.productSlug ?? "",
      quantity: item.quantity,
      unitPrice: fromCents(unitPriceCents),
      lineTotal: fromCents(lineTotalCents),
    };
  });

  const totalCents = fromDbMoney(order.totalAmount);
  return {
    id: order.id,
    totalCents,
    totalAmount: fromCents(totalCents),
    currency: order.currency,
    paymentStatus: order.paymentStatus,
    paymentProvider: (order.paymentProvider ?? "stripe") as PaymentProvider,
    paymentIntentId: order.paymentIntentId ?? undefined,
    createdAt: order.createdAt,
    items: normalizedItems,
  };
}

async function getOrderByIdempotencyKey(
  db: ReturnType<typeof requireDb>,
  key: string
): Promise<OrderSummary | null> {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.idempotencyKey, key))
    .limit(1);
  if (!order) return null;

  const items = await db
    .select(orderItemSummarySelection)
    .from(orderItems)
    .leftJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, order.id));

  return parseOrderSummary(order, items);
}

async function getProductsForCheckout(productIds: string[]) {
  if (!productIds.length) return [];
  const db = requireDb();
  return db
    .select()
    .from(products)
    .where(and(eq(products.isActive, true), inArray(products.id, productIds)));
}

function validateCurrencyConsistency(
  dbProducts: (typeof products.$inferSelect)[]
): Currency {
  const currencies = new Set(dbProducts.map((product) => product.currency));
  if (currencies.size > 1) {
    throw new InvalidPayloadError("Product currencies are misconfigured.");
  }

  const configuredCurrency = currencyValues[0];
  const currency = currencies.values().next().value ?? configuredCurrency;
  if (currency !== configuredCurrency) {
    throw new InvalidPayloadError("Product currencies are misconfigured.");
  }

  return currency as Currency;
}

function priceItems(
  items: CheckoutItem[],
  productMap: Map<string, typeof products.$inferSelect>
) {
  return items.map((item) => {
    const product = productMap.get(item.productId);

    if (!product) {
      throw new InvalidPayloadError("Some products are unavailable.");
    }

    const unitPrice = coercePriceFromDb(product.price, {
      field: "price",
      productId: product.id,
    });
    if (unitPrice <= 0) {
      throw new InvalidPayloadError("Product pricing is misconfigured.");
    }

    const unitPriceCents = toCents(unitPrice);
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
      currency: product.currency,
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
  const paymentProvider: PaymentProvider = paymentsEnabled ? "stripe" : "none";
  const paymentStatus: PaymentStatus =
    paymentProvider === "stripe" ? "pending" : "paid";

  const db = requireDb();
  const summary = await db.transaction(async (tx) => {
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
      throw new Error("Failed to create order");
    }

    if (items.length) {
      await tx.insert(orderItems).values(
        items.map((item) => ({
          orderId: createdOrder.id,
          productId: item.productId,
          quantity: item.quantity,
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
}: {
  items: CheckoutItem[];
  idempotencyKey: string;
  userId?: string | null;
}): Promise<CheckoutResult> {
  const db = requireDb();

  const existing = await getOrderByIdempotencyKey(db, idempotencyKey);
  if (existing) {
    return {
      order: existing,
      isNew: false,
      totalCents: existing.totalCents ?? toCents(existing.totalAmount),
    };
  }

  const uniqueProductIds = Array.from(
    new Set(items.map((item) => item.productId))
  );
  const dbProducts = await getProductsForCheckout(uniqueProductIds);

  if (dbProducts.length !== uniqueProductIds.length) {
    throw new InvalidPayloadError("Some products are unavailable.");
  }

  const currency = validateCurrencyConsistency(dbProducts);
  const productMap = new Map(
    dbProducts.map((product) => [product.id, product])
  );
  const pricedItems = priceItems(items, productMap);
  const orderTotalCents = sumLineTotals(
    pricedItems.map((item) => item.lineTotalCents)
  );
  
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
    if ((error as { code?: string }).code === "23505") {
      const existingOrder = await getOrderByIdempotencyKey(db, idempotencyKey);
      if (existingOrder) {
        return {
          order: existingOrder,
          isNew: false,
          totalCents:
            existingOrder.totalCents ?? toCents(existingOrder.totalAmount),
        };
      }
    }

    throw error;
  }
}

async function getOrderItems(db: DbOrTx, orderId: string) {
  return db
    .select(orderItemSummarySelection)
    .from(orderItems)
    .leftJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, orderId));
}

export async function getOrderById(id: string): Promise<OrderDetail> {
  const db = requireDb();
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, id))
    .limit(1);
  if (!order) {
    throw new OrderNotFoundError("Order not found");
  }

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
  const db = requireDb();
  const [order] = await db
    .update(orders)
    .set({
      paymentIntentId,
      paymentStatus: "requires_payment",
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId))
    .returning();

  if (!order) {
    throw new OrderNotFoundError("Order not found");
  }

  const items = await getOrderItems(db, orderId);
  return parseOrderSummary(order, items);
}

async function restockOrderInTx(
  tx: DbTransaction,
  orderId: string,
  reason?: "failed" | "refunded" | "canceled" | "stale"
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
    .for("update");

  if (!order) {
    throw new OrderNotFoundError("Order not found");
  }

  if (order.stockRestored || order.restockedAt !== null) {
    return;
  }

  const items = await tx
    .select({
      productId: orderItems.productId,
      quantity: orderItems.quantity,
    })
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
  if (reason === "refunded") {
    normalizedStatus = "refunded";
  } else if (reason === "failed" || reason === "canceled" || reason === "stale") {
    normalizedStatus = "failed";
  }

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
    reason?: "failed" | "refunded" | "canceled" | "stale";
    tx?: DbTransaction;
  }
): Promise<void> {
  const { reason, tx } = options ?? {};

  if (tx) {
    await restockOrderInTx(tx, orderId, reason);
    return;
  }

  const db = requireDb();

  await db.transaction(async (transaction) => {
    await restockOrderInTx(transaction, orderId, reason);
  });
}

export async function restockStalePendingOrders(options?: {
  olderThanMinutes?: number;
}): Promise<number> {
  const db = requireDb();
  const olderThanMinutes = options?.olderThanMinutes ?? 60;
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);

  const staleOrders = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        inArray(orders.paymentStatus, [
          "pending",
          "requires_payment",
        ] as PaymentStatus[]),
        eq(orders.stockRestored, false),
        isNull(orders.restockedAt),
        lt(orders.createdAt, cutoff)
      )
    );

  let processed = 0;
  for (const staleOrder of staleOrders) {
    await restockOrder(staleOrder.id, { reason: "stale" });
    processed += 1;
  }

  return processed;
}

export async function refundOrder(orderId: string): Promise<OrderSummary> {
  const db = requireDb();

  const [order] = await db
    .select({
      id: orders.id,
      paymentStatus: orders.paymentStatus,
      stockRestored: orders.stockRestored,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order) {
    throw new OrderNotFoundError("Order not found");
  }

  const refundableStatuses: PaymentStatus[] = ["paid", "failed"];
  if (!refundableStatuses.includes(order.paymentStatus as PaymentStatus)) {
    throw new InvalidPayloadError(
      "Order cannot be refunded from the current status."
    );
  }

  const [updatedOrder] = await db
    .update(orders)
    .set({ paymentStatus: "refunded", updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning();

  if (!updatedOrder) {
    throw new Error("Failed to update order status");
  }

  const items = await getOrderItems(db, orderId);
  const summary = parseOrderSummary(updatedOrder, items);

  if (!order.stockRestored) {
    await restockOrder(orderId, { reason: "refunded" });
  }

  return summary;
}

export { restockOrder as restock };
