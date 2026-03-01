import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '@/db';
import {
  orderItems,
  orders,
  paymentAttempts,
  products,
  shippingEvents,
  shippingQuotes,
} from '@/db/schema';
import { InvalidPayloadError } from '@/lib/services/errors';
import {
  acceptIntlQuote,
  declineIntlQuote,
  offerIntlQuote,
  requestIntlQuote,
  sweepAcceptedIntlQuotePaymentTimeouts,
  sweepExpiredOfferedIntlQuotes,
} from '@/lib/services/shop/quotes';
import { toDbMoney } from '@/lib/shop/money';

type Seeded = {
  orderId: string;
  productId: string;
};

async function seedIntlOrder(args?: {
  stock?: number;
  quantity?: number;
  totalAmountMinor?: number;
}) {
  const orderId = crypto.randomUUID();
  const productId = crypto.randomUUID();
  const quantity = args?.quantity ?? 1;
  const totalAmountMinor = args?.totalAmountMinor ?? 1000;

  await db.insert(products).values({
    id: productId,
    slug: `phase2-intl-${crypto.randomUUID()}`,
    title: 'Phase 2 INTL Product',
    description: 'Test product',
    imageUrl: 'https://example.com/p.png',
    imagePublicId: null,
    price: toDbMoney(1000),
    originalPrice: null,
    currency: 'USD',
    stock: args?.stock ?? 10,
    sku: null,
    isActive: true,
    isFeatured: false,
  } as any);

  await db.insert(orders).values({
    id: orderId,
    totalAmountMinor,
    totalAmount: toDbMoney(totalAmountMinor),
    currency: 'USD',
    paymentProvider: 'stripe',
    paymentStatus: 'pending',
    status: 'CREATED',
    inventoryStatus: 'none',
    idempotencyKey: `idem_${crypto.randomUUID()}`,
    fulfillmentMode: 'intl',
    quoteStatus: 'none',
    itemsSubtotalMinor: totalAmountMinor,
  } as any);

  await db.insert(orderItems).values({
    id: crypto.randomUUID(),
    orderId,
    productId,
    selectedSize: '',
    selectedColor: '',
    quantity,
    unitPriceMinor: 1000,
    lineTotalMinor: 1000 * quantity,
    unitPrice: toDbMoney(1000),
    lineTotal: toDbMoney(1000 * quantity),
    productTitle: 'Phase 2 INTL Product',
    productSlug: 'phase2-intl',
    productSku: null,
  } as any);

  return { orderId, productId };
}

async function cleanupSeed(seed: Seeded) {
  await db.delete(paymentAttempts).where(eq(paymentAttempts.orderId, seed.orderId));
  await db.delete(orders).where(eq(orders.id, seed.orderId));
  await db.delete(products).where(eq(products.id, seed.productId));
}

describe.sequential('intl quote domain (phase 2)', () => {
  it('quote offer rejects version conflict', async () => {
    const seed = await seedIntlOrder();
    try {
      await requestIntlQuote({
        orderId: seed.orderId,
        requestId: `req_${crypto.randomUUID()}`,
        actorUserId: null,
      });

      await expect(
        offerIntlQuote({
          orderId: seed.orderId,
          requestId: `req_${crypto.randomUUID()}`,
          actorUserId: null,
          version: 2,
          currency: 'USD',
          shippingQuoteMinor: 500,
        })
      ).rejects.toMatchObject({
        code: 'QUOTE_VERSION_CONFLICT',
      });
    } finally {
      await cleanupSeed(seed);
    }
  });

  it('accept rejects stale quote version', async () => {
    const seed = await seedIntlOrder();
    try {
      await requestIntlQuote({
        orderId: seed.orderId,
        requestId: `req_${crypto.randomUUID()}`,
        actorUserId: null,
      });
      await offerIntlQuote({
        orderId: seed.orderId,
        requestId: `req_${crypto.randomUUID()}`,
        actorUserId: null,
        version: 1,
        currency: 'USD',
        shippingQuoteMinor: 500,
      });
      await declineIntlQuote({
        orderId: seed.orderId,
        requestId: `req_${crypto.randomUUID()}`,
        actorUserId: null,
        version: 1,
      });
      await offerIntlQuote({
        orderId: seed.orderId,
        requestId: `req_${crypto.randomUUID()}`,
        actorUserId: null,
        version: 2,
        currency: 'USD',
        shippingQuoteMinor: 650,
      });

      await expect(
        acceptIntlQuote({
          orderId: seed.orderId,
          requestId: `req_${crypto.randomUUID()}`,
          actorUserId: null,
          version: 1,
        })
      ).rejects.toMatchObject({
        code: 'QUOTE_VERSION_CONFLICT',
      });
    } finally {
      await cleanupSeed(seed);
    }
  });

  it('accept rejects expired quote and projects status to expired', async () => {
    const seed = await seedIntlOrder();
    try {
      await requestIntlQuote({
        orderId: seed.orderId,
        requestId: `req_${crypto.randomUUID()}`,
        actorUserId: null,
      });
      await offerIntlQuote({
        orderId: seed.orderId,
        requestId: `req_${crypto.randomUUID()}`,
        actorUserId: null,
        version: 1,
        currency: 'USD',
        shippingQuoteMinor: 500,
      });

      await db
        .update(shippingQuotes)
        .set({
          expiresAt: new Date(Date.now() - 60_000),
          updatedAt: new Date(),
        })
        .where(
          eq(shippingQuotes.orderId, seed.orderId)
        );

      await expect(
        acceptIntlQuote({
          orderId: seed.orderId,
          requestId: `req_${crypto.randomUUID()}`,
          actorUserId: null,
          version: 1,
        })
      ).rejects.toMatchObject({
        code: 'QUOTE_EXPIRED',
      });

      const [orderRow] = await db
        .select({ quoteStatus: orders.quoteStatus })
        .from(orders)
        .where(eq(orders.id, seed.orderId))
        .limit(1);
      const [quoteRow] = await db
        .select({ status: shippingQuotes.status })
        .from(shippingQuotes)
        .where(eq(shippingQuotes.orderId, seed.orderId))
        .limit(1);

      expect(orderRow?.quoteStatus).toBe('expired');
      expect(quoteRow?.status).toBe('expired');
    } finally {
      await cleanupSeed(seed);
    }
  });

  it('accept reserves inventory and sets accepted payment deadline', async () => {
    const seed = await seedIntlOrder({ stock: 5, quantity: 2, totalAmountMinor: 2000 });
    try {
      await requestIntlQuote({
        orderId: seed.orderId,
        requestId: `req_${crypto.randomUUID()}`,
        actorUserId: null,
      });
      await offerIntlQuote({
        orderId: seed.orderId,
        requestId: `req_${crypto.randomUUID()}`,
        actorUserId: null,
        version: 1,
        currency: 'USD',
        shippingQuoteMinor: 700,
      });

      const accepted = await acceptIntlQuote({
        orderId: seed.orderId,
        requestId: `req_${crypto.randomUUID()}`,
        actorUserId: null,
        version: 1,
      });

      expect(accepted.quoteStatus).toBe('accepted');
      expect(accepted.changed).toBe(true);
      expect(accepted.totalAmountMinor).toBe(2700);
      expect(accepted.paymentDeadlineAt).toBeInstanceOf(Date);

      const [orderRow] = await db
        .select({
          quoteStatus: orders.quoteStatus,
          inventoryStatus: orders.inventoryStatus,
          quotePaymentDeadlineAt: orders.quotePaymentDeadlineAt,
          totalAmountMinor: orders.totalAmountMinor,
        })
        .from(orders)
        .where(eq(orders.id, seed.orderId))
        .limit(1);
      const [productRow] = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, seed.productId))
        .limit(1);

      expect(orderRow?.quoteStatus).toBe('accepted');
      expect(orderRow?.inventoryStatus).toBe('reserved');
      expect(orderRow?.quotePaymentDeadlineAt).toBeTruthy();
      expect(orderRow?.totalAmountMinor).toBe(2700);
      expect(productRow?.stock).toBe(3);
    } finally {
      await cleanupSeed(seed);
    }
  });

  it('accept returns QUOTE_STOCK_UNAVAILABLE and sets requires_requote when reserve fails', async () => {
    const seed = await seedIntlOrder({ stock: 0, quantity: 1, totalAmountMinor: 1000 });
    try {
      await requestIntlQuote({
        orderId: seed.orderId,
        requestId: `req_${crypto.randomUUID()}`,
        actorUserId: null,
      });
      await offerIntlQuote({
        orderId: seed.orderId,
        requestId: `req_${crypto.randomUUID()}`,
        actorUserId: null,
        version: 1,
        currency: 'USD',
        shippingQuoteMinor: 500,
      });

      await expect(
        acceptIntlQuote({
          orderId: seed.orderId,
          requestId: `req_${crypto.randomUUID()}`,
          actorUserId: null,
          version: 1,
        })
      ).rejects.toMatchObject<Partial<InvalidPayloadError>>({
        code: 'QUOTE_STOCK_UNAVAILABLE',
      });

      const [orderRow] = await db
        .select({
          quoteStatus: orders.quoteStatus,
          inventoryStatus: orders.inventoryStatus,
          failureCode: orders.failureCode,
        })
        .from(orders)
        .where(eq(orders.id, seed.orderId))
        .limit(1);
      const [quoteRow] = await db
        .select({ status: shippingQuotes.status })
        .from(shippingQuotes)
        .where(eq(shippingQuotes.orderId, seed.orderId))
        .limit(1);

      expect(orderRow?.quoteStatus).toBe('requires_requote');
      expect(orderRow?.inventoryStatus).toBe('failed');
      expect(orderRow?.failureCode).toBe('QUOTE_STOCK_UNAVAILABLE');
      expect(quoteRow?.status).toBe('requires_requote');
    } finally {
      await cleanupSeed(seed);
    }
  });

  it('writes canonical quote transition events by default', async () => {
    const orderA = await seedIntlOrder();
    const orderB = await seedIntlOrder();
    const orderC = await seedIntlOrder({ stock: 2, quantity: 1, totalAmountMinor: 1000 });

    try {
      await requestIntlQuote({
        orderId: orderA.orderId,
        requestId: `req_${crypto.randomUUID()}`,
        actorUserId: null,
      });
      await offerIntlQuote({
        orderId: orderA.orderId,
        requestId: `req_${crypto.randomUUID()}`,
        actorUserId: null,
        version: 1,
        currency: 'USD',
        shippingQuoteMinor: 300,
      });
      await declineIntlQuote({
        orderId: orderA.orderId,
        requestId: `req_${crypto.randomUUID()}`,
        actorUserId: null,
        version: 1,
      });

      await requestIntlQuote({
        orderId: orderB.orderId,
        requestId: `req_${crypto.randomUUID()}`,
        actorUserId: null,
      });
      await offerIntlQuote({
        orderId: orderB.orderId,
        requestId: `req_${crypto.randomUUID()}`,
        actorUserId: null,
        version: 1,
        currency: 'USD',
        shippingQuoteMinor: 450,
      });
      await db
        .update(shippingQuotes)
        .set({
          expiresAt: new Date(Date.now() - 60_000),
          updatedAt: new Date(),
        })
        .where(eq(shippingQuotes.orderId, orderB.orderId));
      const expiredCount = await sweepExpiredOfferedIntlQuotes({
        batchSize: 10,
      });
      expect(expiredCount).toBeGreaterThanOrEqual(1);

      await requestIntlQuote({
        orderId: orderC.orderId,
        requestId: `req_${crypto.randomUUID()}`,
        actorUserId: null,
      });
      await offerIntlQuote({
        orderId: orderC.orderId,
        requestId: `req_${crypto.randomUUID()}`,
        actorUserId: null,
        version: 1,
        currency: 'USD',
        shippingQuoteMinor: 550,
      });
      await acceptIntlQuote({
        orderId: orderC.orderId,
        requestId: `req_${crypto.randomUUID()}`,
        actorUserId: null,
        version: 1,
      });
      await db
        .update(orders)
        .set({
          quotePaymentDeadlineAt: new Date(Date.now() - 60_000),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderC.orderId));
      const timeoutCount = await sweepAcceptedIntlQuotePaymentTimeouts({
        batchSize: 10,
      });
      expect(timeoutCount).toBeGreaterThanOrEqual(1);

      const eventsA = await db
        .select({ eventName: shippingEvents.eventName })
        .from(shippingEvents)
        .where(eq(shippingEvents.orderId, orderA.orderId));
      expect(eventsA.map(e => e.eventName)).toEqual(
        expect.arrayContaining([
          'quote_requested',
          'quote_offered',
          'quote_declined',
        ])
      );

      const eventsB = await db
        .select({ eventName: shippingEvents.eventName })
        .from(shippingEvents)
        .where(eq(shippingEvents.orderId, orderB.orderId));
      expect(eventsB.map(e => e.eventName)).toEqual(
        expect.arrayContaining(['quote_expired'])
      );

      const eventsC = await db
        .select({ eventName: shippingEvents.eventName })
        .from(shippingEvents)
        .where(eq(shippingEvents.orderId, orderC.orderId));
      expect(eventsC.map(e => e.eventName)).toEqual(
        expect.arrayContaining([
          'quote_requested',
          'quote_offered',
          'quote_accepted',
          'quote_timeout_requires_requote',
        ])
      );
    } finally {
      await cleanupSeed(orderA);
      await cleanupSeed(orderB);
      await cleanupSeed(orderC);
    }
  });
});
