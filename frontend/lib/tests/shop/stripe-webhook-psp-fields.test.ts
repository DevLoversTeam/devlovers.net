import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { db } from '@/db';
import {
  products,
  productPrices,
  orders,
  orderItems,
  stripeEvents,
} from '@/db/schema';

vi.mock('@/lib/psp/stripe', async () => {
  const actual =
    await vi.importActual<Record<string, unknown>>('@/lib/psp/stripe');
  return {
    ...actual,
    verifyWebhookSignature: vi.fn(),
  };
});

import { verifyWebhookSignature } from '@/lib/psp/stripe';
import { POST as webhookPOST } from '@/app/api/shop/webhooks/stripe/route';

function logTestCleanupFailed(meta: Record<string, unknown>, error: unknown) {
  console.error('[test cleanup failed]', {
    file: 'stripe-webhook-psp-fields.test.ts',
    ...meta,
    error,
  });
}

function makeWebhookRequest(rawBody: string) {
  return new NextRequest('http://localhost:3000/api/shop/webhooks/stripe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',

      'Stripe-Signature': 't=1,v1=test',
    },
    body: rawBody,
  });
}

async function cleanup(params: {
  orderId: string;
  productId: string;
  eventId: string;
}) {
  const { orderId, productId, eventId } = params;

  try {
    await db.delete(stripeEvents).where(eq(stripeEvents.eventId, eventId));
  } catch (e) {
    logTestCleanupFailed(
      { step: 'delete stripeEvents by eventId', eventId, orderId, productId },
      e
    );
  }

  try {
    await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
  } catch (e) {
    logTestCleanupFailed(
      { step: 'delete orderItems by orderId', orderId, eventId, productId },
      e
    );
  }

  try {
    await db.delete(orders).where(eq(orders.id, orderId));
  } catch (e) {
    logTestCleanupFailed(
      { step: 'delete order by id', orderId, eventId, productId },
      e
    );
  }

  try {
    await db
      .delete(productPrices)
      .where(eq(productPrices.productId, productId));
  } catch (e) {
    logTestCleanupFailed(
      {
        step: 'delete productPrices by productId',
        productId,
        orderId,
        eventId,
      },
      e
    );
  }

  try {
    await db.delete(products).where(eq(products.id, productId));
  } catch (e) {
    logTestCleanupFailed(
      { step: 'delete product by id', productId, orderId, eventId },
      e
    );
  }
}

describe('P0-6 webhook: writes PSP fields on succeeded', () => {
  it('payment_intent.succeeded must set PSP fields + pspMetadata and be idempotent on duplicate eventId', async () => {
    const productId = randomUUID();
    const priceId = randomUUID();

    const orderId = randomUUID();
    const idemKey = `idem_${randomUUID()}`;

    const paymentIntentId = `pi_test_${randomUUID()
      .replace(/-/g, '')
      .slice(0, 24)}`;
    const eventId = `evt_test_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const chargeId = `ch_test_${randomUUID().replace(/-/g, '').slice(0, 24)}`;

    const title = 'Webhook PSP Test Product';
    const slug = `webhook-psp-${productId.slice(0, 8)}`;
    const sku = `SKU-${productId.slice(0, 8)}`;

    await db.insert(products).values({
      id: productId,
      slug,
      title,
      description: 'webhook test',
      imageUrl: 'https://res.cloudinary.com/devlovers/image/upload/v1/test.png',
      imagePublicId: null,
      price: '9.00',
      originalPrice: null,
      currency: 'USD',
      category: null,
      type: null,
      colors: [],
      sizes: [],
      badge: 'NONE',
      isActive: true,
      isFeatured: false,
      stock: 10,
      sku,
    });

    await db.insert(productPrices).values({
      id: priceId,
      productId,
      currency: 'USD',
      priceMinor: 900,
      originalPriceMinor: null,
      price: '9.00',
      originalPrice: null,
    });

    await db.insert(orders).values({
      id: orderId,
      totalAmountMinor: 900,
      totalAmount: '9.00',
      currency: 'USD',
      paymentStatus: 'requires_payment',
      paymentProvider: 'stripe',
      paymentIntentId,

      idempotencyKey: idemKey,
      status: 'INVENTORY_RESERVED',
      inventoryStatus: 'reserved',
    });

    await db.insert(orderItems).values({
      id: randomUUID(),
      orderId,
      productId,
      quantity: 1,
      unitPriceMinor: 900,
      lineTotalMinor: 900,
      unitPrice: '9.00',
      lineTotal: '9.00',
      productTitle: title,
      productSlug: slug,
      productSku: sku,
    });

    const event = {
      id: eventId,
      object: 'event',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: paymentIntentId,
          object: 'payment_intent',
          amount: 900,
          currency: 'usd',
          status: 'succeeded',
          metadata: { orderId },
          charges: {
            object: 'list',
            data: [
              {
                id: chargeId,
                object: 'charge',
                payment_intent: paymentIntentId,
                payment_method_details: {
                  type: 'card',
                  card: { brand: 'visa', last4: '4242' },
                },
              },
            ],
          },
        },
      },
    };

    vi.mocked(verifyWebhookSignature).mockReturnValue(event as any);

    const rawBody = JSON.stringify({ any: 'payload' });
    const req = makeWebhookRequest(rawBody);

    try {
      const res = await webhookPOST(req);
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
      const mockedVerify = vi.mocked(verifyWebhookSignature);

      expect(mockedVerify).toHaveBeenCalled();

      const firstArg = mockedVerify.mock.calls[0]?.[0];
      expect(firstArg).toBeTruthy();

      expect(firstArg).toMatchObject({
        rawBody,
        signatureHeader: 't=1,v1=test',
      });

      const updated1 = await db
        .select({
          id: orders.id,
          paymentStatus: orders.paymentStatus,
          paymentIntentId: orders.paymentIntentId,
          pspChargeId: orders.pspChargeId,
          pspPaymentMethod: orders.pspPaymentMethod,
          pspStatusReason: orders.pspStatusReason,
          pspMetadata: orders.pspMetadata,
        })
        .from(orders)
        .where(eq(orders.id, orderId));

      expect(updated1.length).toBe(1);
      expect(updated1[0].paymentIntentId).toBe(paymentIntentId);

      expect(updated1[0].paymentStatus).toBe('paid');

      expect(updated1[0].pspChargeId).toBe(chargeId);
      expect(typeof updated1[0].pspPaymentMethod).toBe('string');
      expect((updated1[0].pspPaymentMethod ?? '').length).toBeGreaterThan(0);

      expect(typeof updated1[0].pspStatusReason).toBe('string');
      expect((updated1[0].pspStatusReason ?? '').toLowerCase()).toContain(
        'succeeded'
      );

      expect(updated1[0].pspMetadata).toBeTruthy();
      expect(
        Object.keys((updated1[0].pspMetadata ?? {}) as Record<string, unknown>)
          .length
      ).toBeGreaterThan(0);

      const ev1 = await db
        .select({ eventId: stripeEvents.eventId })
        .from(stripeEvents)
        .where(eq(stripeEvents.eventId, eventId));

      expect(ev1.length).toBe(1);

      const req2 = makeWebhookRequest(rawBody);
      const res2 = await webhookPOST(req2);
      expect(res2.status).toBeGreaterThanOrEqual(200);
      expect(res2.status).toBeLessThan(500);

      const ev2 = await db
        .select({ eventId: stripeEvents.eventId })
        .from(stripeEvents)
        .where(eq(stripeEvents.eventId, eventId));

      expect(ev2.length).toBe(1);

      const updated2 = await db
        .select({
          paymentStatus: orders.paymentStatus,
          pspChargeId: orders.pspChargeId,
          pspStatusReason: orders.pspStatusReason,
          pspMetadata: orders.pspMetadata,
        })
        .from(orders)
        .where(eq(orders.id, orderId));

      expect(updated2.length).toBe(1);
      expect(updated2[0].paymentStatus).toBe('paid');
      expect(updated2[0].pspChargeId).toBe(chargeId);
      expect(
        Object.keys((updated2[0].pspMetadata ?? {}) as Record<string, unknown>)
          .length
      ).toBeGreaterThan(0);
    } finally {
      await cleanup({ orderId, productId, eventId });
    }
  }, 30_000);
});
