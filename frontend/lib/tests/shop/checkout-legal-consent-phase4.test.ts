import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import {
  orderLegalConsents,
  orders,
  productPrices,
  products,
} from '@/db/schema/shop';
import { getShopLegalVersions } from '@/lib/env/shop-legal';
import { IdempotencyConflictError } from '@/lib/services/errors';
import { createOrderWithItems } from '@/lib/services/orders';
import { toDbMoney } from '@/lib/shop/money';

type SeedProduct = {
  productId: string;
};

async function seedProduct(): Promise<SeedProduct> {
  const productId = crypto.randomUUID();
  const now = new Date();

  await db.insert(products).values({
    id: productId,
    slug: `checkout-legal-${productId.slice(0, 8)}`,
    title: 'Checkout Legal Consent Test Product',
    imageUrl: 'https://example.com/legal-consent.png',
    price: '10.00',
    currency: 'USD',
    isActive: true,
    stock: 10,
    sizes: [],
    colors: [],
    createdAt: now,
    updatedAt: now,
  } as any);

  await db.insert(productPrices).values([
    {
      id: crypto.randomUUID(),
      productId,
      currency: 'USD',
      priceMinor: 1000,
      originalPriceMinor: null,
      price: toDbMoney(1000),
      originalPrice: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      productId,
      currency: 'UAH',
      priceMinor: 4200,
      originalPriceMinor: null,
      price: toDbMoney(4200),
      originalPrice: null,
      createdAt: now,
      updatedAt: now,
    },
  ] as any);

  return { productId };
}

async function cleanupProduct(productId: string) {
  await db.delete(productPrices).where(eq(productPrices.productId, productId));
  await db.delete(products).where(eq(products.id, productId));
}

async function cleanupOrder(orderId: string) {
  await db.delete(orders).where(eq(orders.id, orderId));
}

function canonicalLegalConsent() {
  const versions = getShopLegalVersions();
  return {
    termsAccepted: true as const,
    privacyAccepted: true as const,
    termsVersion: versions.termsVersion,
    privacyVersion: versions.privacyVersion,
  };
}

describe('checkout legal consent phase 4', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('SHOP_TERMS_VERSION', 'terms-2026-02-27');
    vi.stubEnv('SHOP_PRIVACY_VERSION', 'privacy-2026-02-27');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('persists legal consent artifact for new order', async () => {
    const { productId } = await seedProduct();
    let orderId: string | null = null;
    const before = Date.now();
    const canonicalVersions = getShopLegalVersions();

    try {
      const result = await createOrderWithItems({
        idempotencyKey: crypto.randomUUID(),
        userId: null,
        locale: 'en-US',
        country: 'US',
        items: [{ productId, quantity: 1 }],
        legalConsent: canonicalLegalConsent(),
      });

      orderId = result.order.id;

      const [row] = await db
        .select({
          orderId: orderLegalConsents.orderId,
          termsAccepted: orderLegalConsents.termsAccepted,
          privacyAccepted: orderLegalConsents.privacyAccepted,
          termsVersion: orderLegalConsents.termsVersion,
          privacyVersion: orderLegalConsents.privacyVersion,
          source: orderLegalConsents.source,
          locale: orderLegalConsents.locale,
          country: orderLegalConsents.country,
          consentedAt: orderLegalConsents.consentedAt,
        })
        .from(orderLegalConsents)
        .where(eq(orderLegalConsents.orderId, orderId))
        .limit(1);
      const after = Date.now();

      expect(row).toBeTruthy();
      expect(row?.termsAccepted).toBe(true);
      expect(row?.privacyAccepted).toBe(true);
      expect(row?.termsVersion).toBe(canonicalVersions.termsVersion);
      expect(row?.privacyVersion).toBe(canonicalVersions.privacyVersion);
      expect(row?.source).toBe('checkout_explicit');
      expect(row?.locale).toBe('en-us');
      expect(row?.country).toBe('US');
      expect(row?.consentedAt).toBeInstanceOf(Date);
      expect(row?.consentedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(row?.consentedAt.getTime()).toBeLessThanOrEqual(after + 1000);
    } finally {
      if (orderId) await cleanupOrder(orderId);
      await cleanupProduct(productId);
    }
  }, 30_000);

  it('rejects mismatched terms version and does not create an order', async () => {
    const { productId } = await seedProduct();
    const idempotencyKey = crypto.randomUUID();
    const canonicalVersions = getShopLegalVersions();

    try {
      await expect(
        createOrderWithItems({
          idempotencyKey,
          userId: null,
          locale: 'en-US',
          country: 'US',
          items: [{ productId, quantity: 1 }],
          legalConsent: {
            termsAccepted: true,
            privacyAccepted: true,
            termsVersion: 'terms-2026-03-01',
            privacyVersion: canonicalVersions.privacyVersion,
          },
        })
      ).rejects.toMatchObject({
        code: 'TERMS_VERSION_MISMATCH',
      });

      const persistedOrders = await db
        .select({
          id: orders.id,
        })
        .from(orders)
        .where(eq(orders.idempotencyKey, idempotencyKey));

      expect(persistedOrders).toHaveLength(0);
    } finally {
      await cleanupProduct(productId);
    }
  }, 30_000);

  it('rejects mismatched privacy version and does not create an order', async () => {
    const { productId } = await seedProduct();
    const idempotencyKey = crypto.randomUUID();
    const canonicalVersions = getShopLegalVersions();

    try {
      await expect(
        createOrderWithItems({
          idempotencyKey,
          userId: null,
          locale: 'en-US',
          country: 'US',
          items: [{ productId, quantity: 1 }],
          legalConsent: {
            termsAccepted: true,
            privacyAccepted: true,
            termsVersion: canonicalVersions.termsVersion,
            privacyVersion: 'privacy-2026-03-01',
          },
        })
      ).rejects.toMatchObject({
        code: 'PRIVACY_VERSION_MISMATCH',
      });

      const persistedOrders = await db
        .select({
          id: orders.id,
        })
        .from(orders)
        .where(eq(orders.idempotencyKey, idempotencyKey));

      expect(persistedOrders).toHaveLength(0);
    } finally {
      await cleanupProduct(productId);
    }
  }, 30_000);

  it('idempotent replay rejects different legal consent against the persisted order contract', async () => {
    const { productId } = await seedProduct();
    let orderId: string | null = null;
    const idempotencyKey = crypto.randomUUID();
    let baselineConsentedAtMs: number | null = null;
    let baselineSource: string | null = null;
    const canonicalVersions = getShopLegalVersions();

    try {
      const first = await createOrderWithItems({
        idempotencyKey,
        userId: null,
        locale: 'en-US',
        country: 'US',
        items: [{ productId, quantity: 1 }],
        legalConsent: canonicalLegalConsent(),
      });

      orderId = first.order.id;
      const [baseline] = await db
        .select({
          consentedAt: orderLegalConsents.consentedAt,
          source: orderLegalConsents.source,
        })
        .from(orderLegalConsents)
        .where(eq(orderLegalConsents.orderId, orderId))
        .limit(1);

      baselineConsentedAtMs = baseline?.consentedAt.getTime() ?? null;
      baselineSource = baseline?.source ?? null;

      await expect(
        createOrderWithItems({
          idempotencyKey,
          userId: null,
          locale: 'en-US',
          country: 'US',
          items: [{ productId, quantity: 1 }],
          legalConsent: {
            termsAccepted: true,
            privacyAccepted: true,
            termsVersion: 'terms-2026-03-01',
            privacyVersion: canonicalVersions.privacyVersion,
          },
        })
      ).rejects.toBeInstanceOf(IdempotencyConflictError);

      const [afterConflict] = await db
        .select({
          consentedAt: orderLegalConsents.consentedAt,
          source: orderLegalConsents.source,
          termsVersion: orderLegalConsents.termsVersion,
          privacyVersion: orderLegalConsents.privacyVersion,
        })
        .from(orderLegalConsents)
        .where(eq(orderLegalConsents.orderId, orderId))
        .limit(1);

      expect(afterConflict).toBeTruthy();
      expect(afterConflict?.consentedAt.getTime()).toBe(baselineConsentedAtMs);
      expect(afterConflict?.source).toBe(baselineSource);
      expect(afterConflict?.termsVersion).toBe(canonicalVersions.termsVersion);
      expect(afterConflict?.privacyVersion).toBe(
        canonicalVersions.privacyVersion
      );
    } finally {
      if (orderId) await cleanupOrder(orderId);
      await cleanupProduct(productId);
    }
  }, 30_000);

  it('replays an existing order even after canonical legal versions rotate', async () => {
    const { productId } = await seedProduct();
    let orderId: string | null = null;
    const idempotencyKey = crypto.randomUUID();
    const baselineConsent = canonicalLegalConsent();

    try {
      const first = await createOrderWithItems({
        idempotencyKey,
        userId: null,
        locale: 'en-US',
        country: 'US',
        items: [{ productId, quantity: 1 }],
        legalConsent: baselineConsent,
      });

      orderId = first.order.id;

      vi.stubEnv('SHOP_TERMS_VERSION', 'terms-2026-04-01');
      vi.stubEnv('SHOP_PRIVACY_VERSION', 'privacy-2026-04-01');

      const replay = await createOrderWithItems({
        idempotencyKey,
        userId: null,
        locale: 'en-US',
        country: 'US',
        items: [{ productId, quantity: 1 }],
        legalConsent: baselineConsent,
      });

      expect(replay.isNew).toBe(false);
      expect(replay.order.id).toBe(orderId);

      const [persisted] = await db
        .select({
          termsVersion: orderLegalConsents.termsVersion,
          privacyVersion: orderLegalConsents.privacyVersion,
        })
        .from(orderLegalConsents)
        .where(eq(orderLegalConsents.orderId, orderId))
        .limit(1);

      expect(persisted).toMatchObject({
        termsVersion: baselineConsent.termsVersion,
        privacyVersion: baselineConsent.privacyVersion,
      });
    } finally {
      if (orderId) await cleanupOrder(orderId);
      await cleanupProduct(productId);
    }
  }, 30_000);

  it('replays an existing order even if the product becomes unavailable after creation', async () => {
    const { productId } = await seedProduct();
    let orderId: string | null = null;
    const idempotencyKey = crypto.randomUUID();

    try {
      const first = await createOrderWithItems({
        idempotencyKey,
        userId: null,
        locale: 'en-US',
        country: 'US',
        items: [{ productId, quantity: 1 }],
        legalConsent: canonicalLegalConsent(),
      });

      orderId = first.order.id;

      await db
        .update(products)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(eq(products.id, productId));

      const replay = await createOrderWithItems({
        idempotencyKey,
        userId: null,
        locale: 'en-US',
        country: 'US',
        items: [{ productId, quantity: 1 }],
        legalConsent: canonicalLegalConsent(),
      });

      expect(replay.isNew).toBe(false);
      expect(replay.order.id).toBe(orderId);
    } finally {
      if (orderId) await cleanupOrder(orderId);
      await cleanupProduct(productId);
    }
  }, 30_000);

  it('repairs a transiently missing legal consent row for a recent matching replay', async () => {
    const { productId } = await seedProduct();
    let orderId: string | null = null;
    const idempotencyKey = crypto.randomUUID();
    const originalConsentedAt = new Date(Date.now() - 5_000);

    try {
      const first = await createOrderWithItems({
        idempotencyKey,
        userId: null,
        locale: 'en-US',
        country: 'US',
        items: [{ productId, quantity: 1 }],
        legalConsent: canonicalLegalConsent(),
      });

      orderId = first.order.id;

      await db
        .update(orders)
        .set({
          createdAt: originalConsentedAt,
          updatedAt: originalConsentedAt,
        })
        .where(eq(orders.id, orderId));

      await db
        .update(orderLegalConsents)
        .set({
          consentedAt: originalConsentedAt,
        })
        .where(eq(orderLegalConsents.orderId, orderId));

      await db
        .delete(orderLegalConsents)
        .where(eq(orderLegalConsents.orderId, orderId));

      const replay = await createOrderWithItems({
        idempotencyKey,
        userId: null,
        locale: 'en-US',
        country: 'US',
        items: [{ productId, quantity: 1 }],
        legalConsent: canonicalLegalConsent(),
      });

      expect(replay.isNew).toBe(false);
      expect(replay.order.id).toBe(orderId);

      const [restored] = await db
        .select({
          orderId: orderLegalConsents.orderId,
          termsVersion: orderLegalConsents.termsVersion,
          privacyVersion: orderLegalConsents.privacyVersion,
          source: orderLegalConsents.source,
          consentedAt: orderLegalConsents.consentedAt,
        })
        .from(orderLegalConsents)
        .where(eq(orderLegalConsents.orderId, orderId))
        .limit(1);

      expect(restored).toBeTruthy();
      expect(restored?.termsVersion).toBe(getShopLegalVersions().termsVersion);
      expect(restored?.privacyVersion).toBe(
        getShopLegalVersions().privacyVersion
      );
      expect(restored?.source).toBe('checkout_explicit');
      expect(restored?.consentedAt.getTime()).toBe(
        originalConsentedAt.getTime()
      );
    } finally {
      if (orderId) await cleanupOrder(orderId);
      await cleanupProduct(productId);
    }
  }, 30_000);

  it('fails closed when idempotent replay finds missing legal consent row outside the replay grace window', async () => {
    const { productId } = await seedProduct();
    let orderId: string | null = null;
    const idempotencyKey = crypto.randomUUID();

    try {
      const first = await createOrderWithItems({
        idempotencyKey,
        userId: null,
        locale: 'en-US',
        country: 'US',
        items: [{ productId, quantity: 1 }],
        legalConsent: canonicalLegalConsent(),
      });

      orderId = first.order.id;

      const staleTimestamp = new Date(Date.now() - 5 * 60_000);
      await db
        .update(orders)
        .set({
          createdAt: staleTimestamp,
          updatedAt: staleTimestamp,
        })
        .where(eq(orders.id, orderId));

      await db
        .delete(orderLegalConsents)
        .where(eq(orderLegalConsents.orderId, orderId));

      await expect(
        createOrderWithItems({
          idempotencyKey,
          userId: null,
          locale: 'en-US',
          country: 'US',
          items: [{ productId, quantity: 1 }],
          legalConsent: canonicalLegalConsent(),
        })
      ).rejects.toMatchObject({
        code: 'IDEMPOTENCY_CONFLICT',
        details: {
          orderId,
          reason: 'LEGAL_CONSENT_MISSING',
        },
      });

      const [missing] = await db
        .select({ orderId: orderLegalConsents.orderId })
        .from(orderLegalConsents)
        .where(eq(orderLegalConsents.orderId, orderId))
        .limit(1);

      expect(missing).toBeUndefined();
    } finally {
      if (orderId) await cleanupOrder(orderId);
      await cleanupProduct(productId);
    }
  }, 30_000);

  it('rejects blank legal consent versions', async () => {
    const { productId } = await seedProduct();

    try {
      await expect(
        createOrderWithItems({
          idempotencyKey: crypto.randomUUID(),
          userId: null,
          locale: 'en-US',
          country: 'US',
          items: [{ productId, quantity: 1 }],
          legalConsent: {
            termsAccepted: true,
            privacyAccepted: true,
            termsVersion: '   ',
            privacyVersion: 'privacy-2026-02-27',
          },
        })
      ).rejects.toMatchObject({
        code: 'TERMS_VERSION_REQUIRED',
      });

      await expect(
        createOrderWithItems({
          idempotencyKey: crypto.randomUUID(),
          userId: null,
          locale: 'en-US',
          country: 'US',
          items: [{ productId, quantity: 1 }],
          legalConsent: {
            termsAccepted: true,
            privacyAccepted: true,
            termsVersion: 'terms-2026-02-27',
            privacyVersion: '   ',
          },
        })
      ).rejects.toMatchObject({
        code: 'PRIVACY_VERSION_REQUIRED',
      });
    } finally {
      await cleanupProduct(productId);
    }
  }, 30_000);

  it('rejects checkout when terms or privacy are explicitly not accepted', async () => {
    const { productId } = await seedProduct();

    try {
      await expect(
        createOrderWithItems({
          idempotencyKey: crypto.randomUUID(),
          userId: null,
          locale: 'en-US',
          country: 'US',
          items: [{ productId, quantity: 1 }],
          legalConsent: {
            termsAccepted: false,
            privacyAccepted: true,
            termsVersion: 'terms-2026-02-27',
            privacyVersion: 'privacy-2026-02-27',
          },
        })
      ).rejects.toMatchObject({
        code: 'TERMS_NOT_ACCEPTED',
      });

      await expect(
        createOrderWithItems({
          idempotencyKey: crypto.randomUUID(),
          userId: null,
          locale: 'en-US',
          country: 'US',
          items: [{ productId, quantity: 1 }],
          legalConsent: {
            termsAccepted: true,
            privacyAccepted: false,
            termsVersion: 'terms-2026-02-27',
            privacyVersion: 'privacy-2026-02-27',
          },
        })
      ).rejects.toMatchObject({
        code: 'PRIVACY_NOT_ACCEPTED',
      });
    } finally {
      await cleanupProduct(productId);
    }
  }, 30_000);

  it('rejects checkout when explicit legal consent is missing and does not write implicit consent', async () => {
    const { productId } = await seedProduct();
    const idempotencyKey = crypto.randomUUID();

    try {
      await expect(
        createOrderWithItems({
          idempotencyKey,
          userId: null,
          locale: 'en-US',
          country: 'US',
          items: [{ productId, quantity: 1 }],
        } as any)
      ).rejects.toMatchObject({
        code: 'LEGAL_CONSENT_REQUIRED',
      });

      const [persistedOrder] = await db
        .select({
          id: orders.id,
          idempotencyKey: orders.idempotencyKey,
        })
        .from(orders)
        .where(eq(orders.idempotencyKey, idempotencyKey))
        .limit(1);

      expect(persistedOrder).toBeUndefined();
    } finally {
      await cleanupProduct(productId);
    }
  }, 30_000);
});
