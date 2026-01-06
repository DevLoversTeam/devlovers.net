// lib/tests/stripe-webhook-psp-fields.test.ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
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
  const actual = await vi.importActual<Record<string, unknown>>(
    '@/lib/psp/stripe'
  );
  return {
    ...actual,
    verifyWebhookSignature: vi.fn(),
  };
});

import { verifyWebhookSignature } from '@/lib/psp/stripe';
import { POST as webhookPOST } from '@/app/api/shop/webhooks/stripe/route';

function makeWebhookRequest(rawBody: string) {
  return new NextRequest('http://localhost:3000/api/shop/webhooks/stripe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // route calls verifyWebhookSignature(rawBody, signatureHeader)
      'Stripe-Signature': 't=1,v1=test',
    },
    body: rawBody,
  } as any);
}

async function cleanup(params: {
  orderId: string;
  productId: string;
  eventId: string;
}) {
  const { orderId, productId, eventId } = params;

  await db.delete(stripeEvents).where(eq(stripeEvents.eventId, eventId));
  await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
  await db.delete(orders).where(eq(orders.id, orderId));

  await db.delete(productPrices).where(eq(productPrices.productId, productId));
  await db.delete(products).where(eq(products.id, productId));
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

    // Seed product + price (needed because order_items FK -> products)
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

    // Seed order in the pre-payment state that webhook expects
    await db.insert(orders).values({
      id: orderId,
      totalAmountMinor: 900,
      totalAmount: '9.00',
      currency: 'USD',
      paymentStatus: 'requires_payment',
      paymentProvider: 'stripe',
      paymentIntentId,
      // keep defaults for PSP fields; metadata default is {}
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

    (
      verifyWebhookSignature as unknown as { mockReturnValue: (v: any) => void }
    ).mockReturnValue(event);

    const rawBody = JSON.stringify({ any: 'payload' });
    const req = makeWebhookRequest(rawBody);

    try {
      const res = await webhookPOST(req);
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);

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

      // Must be marked paid (or at minimum be terminal + PSP fields set; but your flow expects paid)
      expect(updated1[0].paymentStatus).toBe('paid');

      // PSP fields must be written
      expect(updated1[0].pspChargeId).toBe(chargeId);
      expect(typeof updated1[0].pspPaymentMethod).toBe('string');
      expect((updated1[0].pspPaymentMethod ?? '').length).toBeGreaterThan(0);

      expect(typeof updated1[0].pspStatusReason).toBe('string');
      expect((updated1[0].pspStatusReason ?? '').toLowerCase()).toContain(
        'succeeded'
      );

      // pspMetadata must not stay "{}"
      expect(updated1[0].pspMetadata).toBeTruthy();
      expect(
        Object.keys((updated1[0].pspMetadata ?? {}) as Record<string, unknown>)
          .length
      ).toBeGreaterThan(0);

      // stripe_events must record the eventId once
      const ev1 = await db
        .select({ eventId: stripeEvents.eventId })
        .from(stripeEvents)
        .where(eq(stripeEvents.eventId, eventId));

      expect(ev1.length).toBe(1);

      // Duplicate delivery must not break (idempotency / dedupe)
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
  });
});
