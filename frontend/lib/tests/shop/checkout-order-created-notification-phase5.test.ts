import crypto from 'node:crypto';

import { and, eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendShopNotificationEmailMock = vi.hoisted(() => vi.fn());
const writePaymentEventState = vi.hoisted(() => ({
  failNext: false,
}));

vi.mock('@/lib/services/shop/notifications/transport', () => ({
  sendShopNotificationEmail: (...args: any[]) =>
    sendShopNotificationEmailMock(...args),
  ShopNotificationTransportError: class ShopNotificationTransportError extends Error {
    code: string;
    transient: boolean;

    constructor(code: string, message: string, transient: boolean) {
      super(message);
      this.name = 'ShopNotificationTransportError';
      this.code = code;
      this.transient = transient;
    }
  },
}));

vi.mock('@/lib/services/shop/events/write-payment-event', async () => {
  const actual = await vi.importActual<any>(
    '@/lib/services/shop/events/write-payment-event'
  );

  return {
    ...actual,
    writePaymentEvent: vi.fn(async (...args: any[]) => {
      if (writePaymentEventState.failNext) {
        writePaymentEventState.failNext = false;
        throw new Error('write_payment_event_forced_failure');
      }

      return actual.writePaymentEvent(...args);
    }),
  };
});

import { db } from '@/db';
import {
  notificationOutbox,
  orders,
  orderShipping,
  paymentEvents,
  productPrices,
  products,
} from '@/db/schema';
import { createOrderWithItems } from '@/lib/services/orders';
import { runNotificationOutboxWorker } from '@/lib/services/shop/notifications/outbox-worker';
import { runNotificationOutboxProjector } from '@/lib/services/shop/notifications/projector';
import { toDbMoney } from '@/lib/shop/money';

import { TEST_LEGAL_CONSENT } from './test-legal-consent';

type SeedProduct = {
  productId: string;
};

async function seedProduct(): Promise<SeedProduct> {
  const productId = crypto.randomUUID();
  const now = new Date();

  await db.insert(products).values({
    id: productId,
    slug: `checkout-order-created-${productId.slice(0, 8)}`,
    title: 'Checkout Order Created Notification Product',
    imageUrl: 'https://example.com/order-created-notification.png',
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
  await db
    .delete(notificationOutbox)
    .where(eq(notificationOutbox.orderId, orderId));
  await db.delete(paymentEvents).where(eq(paymentEvents.orderId, orderId));
  await db.delete(orderShipping).where(eq(orderShipping.orderId, orderId));
  await db.delete(orders).where(eq(orders.id, orderId));
}

async function attachRecipientEmail(orderId: string, email: string) {
  await db
    .insert(orderShipping)
    .values({
      orderId,
      shippingAddress: {
        recipient: {
          fullName: 'Test Buyer',
          email,
        },
      },
    } as any)
    .onConflictDoUpdate({
      target: orderShipping.orderId,
      set: {
        shippingAddress: {
          recipient: {
            fullName: 'Test Buyer',
            email,
          },
        },
        updatedAt: new Date(),
      } as any,
    });
}

async function loadOrderOutboxRow(orderId: string) {
  const [row] = await db
    .select({
      status: notificationOutbox.status,
      templateKey: notificationOutbox.templateKey,
    })
    .from(notificationOutbox)
    .where(eq(notificationOutbox.orderId, orderId))
    .limit(1);

  return row;
}

async function runNotificationWorkerUntilSent(orderId: string, maxRuns = 20) {
  for (let run = 0; run < maxRuns; run += 1) {
    const row = await loadOrderOutboxRow(orderId);
    if (row?.status === 'sent') {
      return row;
    }

    await runNotificationOutboxWorker({
      runId: `notify-worker-${crypto.randomUUID()}`,
      limit: 5000,
      leaseSeconds: 120,
      maxAttempts: 5,
      baseBackoffSeconds: 5,
    });
  }

  return loadOrderOutboxRow(orderId);
}

async function cleanupOrphanOrderCreatedArtifacts() {
  await db.execute(sql`
    delete from notification_outbox
    where template_key = 'order_created'
      and source_domain = 'payment_event'
      and order_id not in (select id from orders)
  `);

  await db.execute(sql`
    delete from payment_events
    where event_name = 'order_created'
      and event_source = 'checkout'
      and order_id not in (select id from orders)
  `);
}

describe.sequential('checkout order-created notification phase 5', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    writePaymentEventState.failNext = false;
    await cleanupOrphanOrderCreatedArtifacts();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('emits one order_created canonical event for the successful order-created path and idempotent replay', async () => {
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
        legalConsent: TEST_LEGAL_CONSENT,
        paymentProvider: 'stripe',
        paymentMethod: 'stripe_card',
      });
      orderId = first.order.id;

      const replay = await createOrderWithItems({
        idempotencyKey,
        userId: null,
        locale: 'en-US',
        country: 'US',
        items: [{ productId, quantity: 1 }],
        legalConsent: TEST_LEGAL_CONSENT,
        paymentProvider: 'stripe',
        paymentMethod: 'stripe_card',
      });

      expect(replay.isNew).toBe(false);
      expect(replay.order.id).toBe(orderId);

      const events = await db
        .select({
          id: paymentEvents.id,
          provider: paymentEvents.provider,
          eventName: paymentEvents.eventName,
          eventSource: paymentEvents.eventSource,
          amountMinor: paymentEvents.amountMinor,
          currency: paymentEvents.currency,
          payload: paymentEvents.payload,
        })
        .from(paymentEvents)
        .where(
          and(
            eq(paymentEvents.orderId, orderId),
            eq(paymentEvents.eventName, 'order_created')
          )
        );

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        provider: 'stripe',
        eventName: 'order_created',
        eventSource: 'checkout',
        amountMinor: 4200,
        currency: 'UAH',
      });
      expect(events[0]?.payload).toMatchObject({
        orderId,
        totalAmountMinor: 4200,
        currency: 'UAH',
        paymentProvider: 'stripe',
        paymentStatus: 'pending',
      });
    } finally {
      if (orderId) await cleanupOrder(orderId);
      await cleanupProduct(productId);
    }
  }, 30_000);

  it('projects order_created into outbox and delivers one transactional confirmation email', async () => {
    sendShopNotificationEmailMock.mockResolvedValue({
      messageId: 'msg-order-created-1',
    });

    const { productId } = await seedProduct();
    let orderId: string | null = null;

    try {
      const created = await createOrderWithItems({
        idempotencyKey: crypto.randomUUID(),
        userId: null,
        locale: 'en-US',
        country: 'US',
        items: [{ productId, quantity: 1 }],
        legalConsent: TEST_LEGAL_CONSENT,
        paymentProvider: 'stripe',
        paymentMethod: 'stripe_card',
      });
      orderId = created.order.id;

      await attachRecipientEmail(orderId, 'buyer@example.test');

      const firstProjectorRun = await runNotificationOutboxProjector({
        limit: 50,
      });
      const secondProjectorRun = await runNotificationOutboxProjector({
        limit: 50,
      });

      expect(firstProjectorRun.scanned).toBeGreaterThanOrEqual(1);
      expect(secondProjectorRun.scanned).toBeGreaterThanOrEqual(0);

      const rows = await db
        .select({
          id: notificationOutbox.id,
          templateKey: notificationOutbox.templateKey,
          sourceDomain: notificationOutbox.sourceDomain,
          payload: notificationOutbox.payload,
          status: notificationOutbox.status,
        })
        .from(notificationOutbox)
        .where(eq(notificationOutbox.orderId, orderId));

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        templateKey: 'order_created',
        sourceDomain: 'payment_event',
      });
      expect(rows[0]?.payload).toMatchObject({
        canonicalEventName: 'order_created',
        canonicalEventSource: 'checkout',
        canonicalPayload: {
          orderId: orderId!,
          totalAmountMinor: 4200,
          currency: 'UAH',
          paymentStatus: 'pending',
        },
      });

      const sentRow = await runNotificationWorkerUntilSent(orderId);

      expect(sentRow?.status).toBe('sent');
      expect(sentRow?.templateKey).toBe('order_created');
    } finally {
      if (orderId) await cleanupOrder(orderId);
      await cleanupProduct(productId);
    }
  }, 30_000);

  it('does not false-fail checkout when the first order_created persistence attempt fails and inline retry persists it', async () => {
    const { productId } = await seedProduct();
    let orderId: string | null = null;

    try {
      writePaymentEventState.failNext = true;

      const first = await createOrderWithItems({
        idempotencyKey: crypto.randomUUID(),
        userId: null,
        locale: 'en-US',
        country: 'US',
        items: [{ productId, quantity: 1 }],
        legalConsent: TEST_LEGAL_CONSENT,
        paymentProvider: 'stripe',
        paymentMethod: 'stripe_card',
      });

      orderId = first.order.id;
      expect(first.isNew).toBe(true);

      const firstEvents = await db
        .select({ id: paymentEvents.id })
        .from(paymentEvents)
        .where(
          and(
            eq(paymentEvents.orderId, orderId),
            eq(paymentEvents.eventName, 'order_created')
          )
        );

      expect(firstEvents).toHaveLength(1);

      const projector = await runNotificationOutboxProjector({
        limit: 50,
      });

      expect(projector.scanned).toBeGreaterThanOrEqual(1);

      const persistedEvents = await db
        .select({
          id: paymentEvents.id,
          eventName: paymentEvents.eventName,
          eventSource: paymentEvents.eventSource,
        })
        .from(paymentEvents)
        .where(
          and(
            eq(paymentEvents.orderId, orderId),
            eq(paymentEvents.eventName, 'order_created')
          )
        );

      expect(persistedEvents).toHaveLength(1);
      expect(persistedEvents[0]).toMatchObject({
        eventName: 'order_created',
        eventSource: 'checkout',
      });

      const rows = await db
        .select({
          templateKey: notificationOutbox.templateKey,
          sourceDomain: notificationOutbox.sourceDomain,
          payload: notificationOutbox.payload,
        })
        .from(notificationOutbox)
        .where(eq(notificationOutbox.orderId, orderId));

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        templateKey: 'order_created',
        sourceDomain: 'payment_event',
      });
      expect(rows[0]?.payload).toMatchObject({
        canonicalEventName: 'order_created',
        canonicalEventSource: 'checkout',
      });
    } finally {
      if (orderId) await cleanupOrder(orderId);
      await cleanupProduct(productId);
    }
  }, 30_000);
});
