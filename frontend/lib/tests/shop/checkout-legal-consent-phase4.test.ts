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

describe('checkout legal consent phase 4', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('persists legal consent artifact for new order', async () => {
    const { productId } = await seedProduct();
    let orderId: string | null = null;
    const before = Date.now();

    try {
      const result = await createOrderWithItems({
        idempotencyKey: crypto.randomUUID(),
        userId: null,
        locale: 'en-US',
        country: 'US',
        items: [{ productId, quantity: 1 }],
        legalConsent: {
          termsAccepted: true,
          privacyAccepted: true,
          termsVersion: 'terms-2026-02-27',
          privacyVersion: 'privacy-2026-02-27',
        },
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
      expect(row?.termsVersion).toBe('terms-2026-02-27');
      expect(row?.privacyVersion).toBe('privacy-2026-02-27');
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

  it('idempotency conflicts if legal consent versions change for same key', async () => {
    const { productId } = await seedProduct();
    let orderId: string | null = null;
    const idempotencyKey = crypto.randomUUID();
    let baselineConsentedAtMs: number | null = null;
    let baselineSource: string | null = null;

    try {
      const first = await createOrderWithItems({
        idempotencyKey,
        userId: null,
        locale: 'en-US',
        country: 'US',
        items: [{ productId, quantity: 1 }],
        legalConsent: {
          termsAccepted: true,
          privacyAccepted: true,
          termsVersion: 'terms-2026-02-27',
          privacyVersion: 'privacy-2026-02-27',
        },
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
            privacyVersion: 'privacy-2026-02-27',
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
      expect(afterConflict?.termsVersion).toBe('terms-2026-02-27');
      expect(afterConflict?.privacyVersion).toBe('privacy-2026-02-27');
    } finally {
      if (orderId) await cleanupOrder(orderId);
      await cleanupProduct(productId);
    }
  }, 30_000);

  it('fails closed when idempotent replay finds missing legal consent row', async () => {
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
        legalConsent: {
          termsAccepted: true,
          privacyAccepted: true,
          termsVersion: 'terms-2026-02-27',
          privacyVersion: 'privacy-2026-02-27',
        },
      });

      orderId = first.order.id;

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
          legalConsent: {
            termsAccepted: true,
            privacyAccepted: true,
            termsVersion: 'terms-2026-02-27',
            privacyVersion: 'privacy-2026-02-27',
          },
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
});
