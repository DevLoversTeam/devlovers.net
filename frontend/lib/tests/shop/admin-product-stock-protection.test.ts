import crypto from 'node:crypto';

import { eq, sql } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(async () => ({
    id: 'admin-user-1',
    role: 'admin',
    email: 'admin@example.com',
  })),
  requireAdminCsrf: vi.fn(() => null),
  parseAdminProductForm: vi.fn(),
  parseAdminProductPhotosForm: vi.fn(() => ({
    ok: true,
    data: { imagePlan: undefined, images: [] },
  })),
  writeAdminAudit: vi.fn(async () => ({
    inserted: true,
    dedupeKey: 'admin_audit:v1:test',
    id: 'audit-row-1',
  })),
}));

vi.mock('@/lib/auth/admin', () => {
  class AdminApiDisabledError extends Error {
    code = 'ADMIN_API_DISABLED' as const;
  }
  class AdminUnauthorizedError extends Error {
    code = 'ADMIN_UNAUTHORIZED' as const;
  }
  class AdminForbiddenError extends Error {
    code = 'ADMIN_FORBIDDEN' as const;
  }
  return {
    AdminApiDisabledError,
    AdminUnauthorizedError,
    AdminForbiddenError,
    requireAdminApi: mocks.requireAdminApi,
  };
});

vi.mock('@/lib/security/admin-csrf', () => ({
  requireAdminCsrf: mocks.requireAdminCsrf,
}));

vi.mock('@/lib/admin/parseAdminProductForm', () => ({
  parseAdminProductForm: mocks.parseAdminProductForm,
  parseAdminProductPhotosForm: mocks.parseAdminProductPhotosForm,
}));

vi.mock('@/lib/services/shop/events/write-admin-audit', () => ({
  writeAdminAudit: mocks.writeAdminAudit,
}));

import { PATCH } from '@/app/api/shop/admin/products/[id]/route';
import { db } from '@/db';
import { orders, productPrices, products } from '@/db/schema';
import { applyReserveMove } from '@/lib/services/inventory';
import { restockOrder } from '@/lib/services/orders';
import { updateProduct } from '@/lib/services/products';
import { toDbMoney } from '@/lib/shop/money';

type SeededProduct = {
  productId: string;
  initialStock: number;
};

type SeededReservedOrder = {
  orderId: string;
  productId: string;
  initialStock: number;
  reservedQty: number;
};

function makePatchRequest(productId: string): NextRequest {
  return new NextRequest(
    new Request(`http://localhost/api/shop/admin/products/${productId}`, {
      method: 'PATCH',
      headers: { origin: 'http://localhost:3000' },
      body: new FormData(),
    })
  );
}

async function countMoveKey(moveKey: string): Promise<number> {
  const result = await db.execute(
    sql`select count(*)::int as n from inventory_moves where move_key = ${moveKey}`
  );
  const rows = Array.isArray((result as { rows?: unknown[] }).rows)
    ? ((result as { rows?: Array<{ n?: number }> }).rows ?? [])
    : [];
  return Number(rows[0]?.n ?? 0);
}

async function seedProduct(initialStock = 10): Promise<SeededProduct> {
  const productId = crypto.randomUUID();
  const suffix = crypto.randomUUID().slice(0, 8);

  await db.insert(products).values({
    id: productId,
    title: `Admin stock protection ${suffix}`,
    slug: `admin-stock-protection-${suffix}`,
    sku: `admin-stock-${suffix}`,
    badge: 'NONE',
    imageUrl: 'https://example.com/admin-stock.png',
    isActive: true,
    isFeatured: false,
    stock: initialStock,
    price: toDbMoney(1000),
    currency: 'USD',
  } as any);

  await db.insert(productPrices).values([
    {
      productId,
      currency: 'UAH',
      priceMinor: 4200,
      originalPriceMinor: null,
      price: toDbMoney(4200),
      originalPrice: null,
    },
    {
      productId,
      currency: 'USD',
      priceMinor: 1000,
      originalPriceMinor: null,
      price: toDbMoney(1000),
      originalPrice: null,
    },
  ]);

  return { productId, initialStock };
}

async function seedReservedOrder(args?: {
  initialStock?: number;
  reservedQty?: number;
}): Promise<SeededReservedOrder> {
  const initialStock = args?.initialStock ?? 10;
  const reservedQty = args?.reservedQty ?? 2;
  const { productId } = await seedProduct(initialStock);
  const orderId = crypto.randomUUID();

  await db.insert(orders).values({
    id: orderId,
    userId: null,
    totalAmountMinor: 4200,
    totalAmount: toDbMoney(4200),
    currency: 'USD',
    paymentProvider: 'stripe',
    paymentStatus: 'failed',
    paymentIntentId: null,
    status: 'INVENTORY_RESERVED',
    inventoryStatus: 'reserved',
    failureCode: null,
    failureMessage: null,
    idempotencyRequestHash: null,
    stockRestored: false,
    restockedAt: null,
    idempotencyKey: `idem_${crypto.randomUUID()}`,
  } as any);

  const reserveResult = await applyReserveMove(orderId, productId, reservedQty);
  expect(reserveResult.ok).toBe(true);
  if (!reserveResult.ok) {
    throw new Error(`Expected reserve to succeed, got ${reserveResult.reason}`);
  }
  expect(reserveResult.applied).toBe(true);

  return {
    orderId,
    productId,
    initialStock,
    reservedQty,
  };
}

async function cleanupReservedOrder(seed: SeededReservedOrder | null) {
  if (!seed) return;
  await db.delete(orders).where(eq(orders.id, seed.orderId));
  await db.delete(products).where(eq(products.id, seed.productId));
}

async function cleanupProduct(seed: SeededProduct | null) {
  if (!seed) return;
  await db.delete(products).where(eq(products.id, seed.productId));
}

describe.sequential('admin product stock protection', () => {
  let reservedSeed: SeededReservedOrder | null = null;
  let productSeed: SeededProduct | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await cleanupReservedOrder(reservedSeed);
    await cleanupProduct(productSeed);
    reservedSeed = null;
    productSeed = null;
  });

  it('allows safe admin product updates that do not overwrite stock', async () => {
    reservedSeed = await seedReservedOrder();

    const updated = await updateProduct(reservedSeed.productId, {
      title: 'Retitled without stock overwrite',
    });

    const [productRow] = await db
      .select({
        title: products.title,
        stock: products.stock,
      })
      .from(products)
      .where(eq(products.id, reservedSeed.productId))
      .limit(1);

    expect(updated.title).toBe('Retitled without stock overwrite');
    expect(productRow?.title).toBe('Retitled without stock overwrite');
    expect(productRow?.stock).toBe(
      reservedSeed.initialStock - reservedSeed.reservedQty
    );
  });

  it('rejects unsafe admin stock overwrite while reserved inventory exists', async () => {
    reservedSeed = await seedReservedOrder();

    mocks.parseAdminProductForm.mockReturnValue({
      ok: true,
      data: {
        title: 'Attempted overwrite',
        stock: reservedSeed.initialStock + 5,
      },
    });

    const res = await PATCH(makePatchRequest(reservedSeed.productId), {
      params: Promise.resolve({ id: reservedSeed.productId }),
    } as any);

    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.code).toBe('STOCK_EDIT_BLOCKED_RESERVED');
    expect(json.field).toBe('stock');
    expect(json.details?.reservedQuantity).toBe(reservedSeed.reservedQty);
    expect(mocks.writeAdminAudit).not.toHaveBeenCalled();

    const [productRow] = await db
      .select({ stock: products.stock, title: products.title })
      .from(products)
      .where(eq(products.id, reservedSeed.productId))
      .limit(1);

    expect(productRow?.stock).toBe(
      reservedSeed.initialStock - reservedSeed.reservedQty
    );
    expect(productRow?.title).not.toBe('Attempted overwrite');
  });

  it('keeps reserve -> blocked admin edit -> release path free from stock drift', async () => {
    reservedSeed = await seedReservedOrder();

    await expect(
      updateProduct(reservedSeed.productId, {
        stock: reservedSeed.initialStock + 7,
      })
    ).rejects.toMatchObject({
      code: 'STOCK_EDIT_BLOCKED_RESERVED',
      details: expect.objectContaining({
        reservedQuantity: reservedSeed.reservedQty,
      }),
    });

    await restockOrder(reservedSeed.orderId, {
      reason: 'failed',
      workerId: 'admin-stock-protection',
      claimTtlMinutes: 5,
    });

    const [productRow] = await db
      .select({ stock: products.stock })
      .from(products)
      .where(eq(products.id, reservedSeed.productId))
      .limit(1);

    const [orderRow] = await db
      .select({
        inventoryStatus: orders.inventoryStatus,
        stockRestored: orders.stockRestored,
      })
      .from(orders)
      .where(eq(orders.id, reservedSeed.orderId))
      .limit(1);

    expect(productRow?.stock).toBe(reservedSeed.initialStock);
    expect(orderRow?.inventoryStatus).toBe('released');
    expect(orderRow?.stockRestored).toBe(true);
    expect(
      await countMoveKey(
        `release:${reservedSeed.orderId}:${reservedSeed.productId}`
      )
    ).toBe(1);
  });

  it('still allows stock overwrite when no reserved inventory exists', async () => {
    productSeed = await seedProduct(4);

    const updated = await updateProduct(productSeed.productId, {
      stock: 9,
    });

    const [productRow] = await db
      .select({ stock: products.stock })
      .from(products)
      .where(eq(products.id, productSeed.productId))
      .limit(1);

    expect(updated.stock).toBe(9);
    expect(productRow?.stock).toBe(9);
  });
});
