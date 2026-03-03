import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import { orders, paymentAttempts, shippingQuotes } from '@/db/schema';
import { toDbMoney } from '@/lib/shop/money';
import { orderPaymentInitPayloadSchema } from '@/lib/validation/shop';

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn().mockResolvedValue({
    id: `admin_${crypto.randomUUID()}`,
    role: 'admin',
  }),
}));

async function cleanupOrder(orderId: string) {
  await db.delete(shippingQuotes).where(eq(shippingQuotes.orderId, orderId));
  await db.delete(paymentAttempts).where(eq(paymentAttempts.orderId, orderId));
  await db.delete(orders).where(eq(orders.id, orderId));
}

async function insertIntlOrderForInit(args: {
  quoteStatus: 'requested' | 'accepted';
  inventoryStatus:
    | 'none'
    | 'reserving'
    | 'reserved'
    | 'release_pending'
    | 'released'
    | 'failed';
  quoteVersion?: number | null;
  deadlineMinutesFromNow?: number | null;
  withAcceptedQuoteRow?: boolean;
}) {
  const orderId = crypto.randomUUID();
  const now = Date.now();
  const deadline =
    args.deadlineMinutesFromNow == null
      ? null
      : new Date(now + args.deadlineMinutesFromNow * 60 * 1000);

  await db.insert(orders).values({
    id: orderId,
    totalAmountMinor: 1000,
    totalAmount: toDbMoney(1000),
    currency: 'USD',
    paymentProvider: 'stripe',
    paymentStatus: 'pending',
    status: 'INVENTORY_RESERVED',
    inventoryStatus: args.inventoryStatus,
    idempotencyKey: `idem_${crypto.randomUUID()}`,
    fulfillmentMode: 'intl',
    quoteStatus: args.quoteStatus,
    quoteVersion: args.quoteVersion ?? null,
    itemsSubtotalMinor: 1000,
    shippingQuoteMinor: args.quoteStatus === 'accepted' ? 200 : null,
    quoteAcceptedAt: args.quoteStatus === 'accepted' ? new Date() : null,
    quotePaymentDeadlineAt: deadline,
  } as any);

  if (args.withAcceptedQuoteRow && args.quoteVersion) {
    await db.insert(shippingQuotes).values({
      id: crypto.randomUUID(),
      orderId,
      version: args.quoteVersion,
      status: 'accepted',
      currency: 'USD',
      shippingQuoteMinor: 200,
      offeredBy: null,
      offeredAt: new Date(Date.now() - 2 * 60 * 1000),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      acceptedAt: new Date(),
      declinedAt: null,
      payload: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
  }

  return orderId;
}

function makeInitRequest(orderId: string, body: unknown = {}) {
  return new NextRequest(
    new Request(`http://localhost/api/shop/orders/${orderId}/payment/init`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify(body),
    })
  );
}

describe.sequential('order payment init intl gate (phase 2)', () => {
  it('blocks payment init when quote is not accepted', async () => {
    const orderId = await insertIntlOrderForInit({
      quoteStatus: 'requested',
      inventoryStatus: 'reserved',
      quoteVersion: 1,
      deadlineMinutesFromNow: 10,
      withAcceptedQuoteRow: false,
    });

    try {
      const { POST } =
        await import('@/app/api/shop/orders/[id]/payment/init/route');
      const res = await POST(makeInitRequest(orderId), {
        params: Promise.resolve({ id: orderId }),
      });
      expect(res.status).toBe(409);
      const json: any = await res.json();
      expect(json.code).toBe('QUOTE_NOT_ACCEPTED');
    } finally {
      await cleanupOrder(orderId);
    }
  });

  it('blocks payment init when accepted quote deadline has passed', async () => {
    const orderId = await insertIntlOrderForInit({
      quoteStatus: 'accepted',
      inventoryStatus: 'reserved',
      quoteVersion: 1,
      deadlineMinutesFromNow: -5,
      withAcceptedQuoteRow: true,
    });

    try {
      const { POST } =
        await import('@/app/api/shop/orders/[id]/payment/init/route');
      const res = await POST(makeInitRequest(orderId), {
        params: Promise.resolve({ id: orderId }),
      });
      expect(res.status).toBe(410);
      const json: any = await res.json();
      expect(json.code).toBe('QUOTE_PAYMENT_WINDOW_EXPIRED');
    } finally {
      await cleanupOrder(orderId);
    }
  });

  it('blocks payment init when inventory is not reserved', async () => {
    const orderId = await insertIntlOrderForInit({
      quoteStatus: 'accepted',
      inventoryStatus: 'none',
      quoteVersion: 1,
      deadlineMinutesFromNow: 10,
      withAcceptedQuoteRow: true,
    });

    try {
      const { POST } =
        await import('@/app/api/shop/orders/[id]/payment/init/route');
      const res = await POST(makeInitRequest(orderId), {
        params: Promise.resolve({ id: orderId }),
      });
      expect(res.status).toBe(409);
      const json: any = await res.json();
      expect(json.code).toBe('QUOTE_INVENTORY_NOT_RESERVED');
    } finally {
      await cleanupOrder(orderId);
    }
  });

  it('provider schema rejects monobank for payment init payload', async () => {
    const parsed = orderPaymentInitPayloadSchema.safeParse({
      provider: 'monobank',
    });
    expect(parsed.success).toBe(false);
  });

  it('database constraint rejects monobank provider on intl orders', async () => {
    await expect(
      db.insert(orders).values({
        id: crypto.randomUUID(),
        totalAmountMinor: 1000,
        totalAmount: toDbMoney(1000),
        currency: 'USD',
        paymentProvider: 'monobank',
        paymentStatus: 'pending',
        status: 'CREATED',
        inventoryStatus: 'none',
        idempotencyKey: `idem_${crypto.randomUUID()}`,
        fulfillmentMode: 'intl',
        quoteStatus: 'none',
        itemsSubtotalMinor: 1000,
      } as any)
    ).rejects.toThrow(/constraint|intl.*monobank|monobank.*intl/i);
  });
});
