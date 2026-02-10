import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import { productPrices, products } from '@/db/schema/shop';
import { createOrderWithItems } from '@/lib/services/orders';

const ORIG_ENV = process.env;

type DbRows<T> = { rows: T[] };

function makeReq(url: string, body: string, headers?: Record<string, string>) {
  return new NextRequest(
    new Request(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(headers ?? {}),
      },
      body,
    })
  );
}

async function pickActiveProductIdForCurrency(currency: 'UAH' | 'USD') {
  const [row] = await db
    .select({ id: products.id })
    .from(products)
    .innerJoin(
      productPrices,
      and(
        eq(productPrices.productId, products.id),
        eq(productPrices.currency, currency)
      )
    )
    .where(
      and(
        eq(products.isActive, true),
        gt(products.stock, 0),
        gt(productPrices.priceMinor, 0)
      )
    )
    .orderBy(desc(products.updatedAt))
    .limit(1);

  const id = row?.id;
  if (!id) {
    throw new Error(
      `No active product found for currency=${currency}. Ensure DB has products.isActive=true, stock>0, and product_prices row.`
    );
  }
  return id;
}

describe('P0-3.4 Stripe webhook: amount/currency mismatch (minor) must not set paid', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIG_ENV };
  });

  afterEach(() => {
    process.env = ORIG_ENV;
    vi.restoreAllMocks();
  });

  it('mismatch: does NOT set paid and stores pspStatusReason + pspMetadata(expected/actual + event id)', async () => {
    process.env.STRIPE_PAYMENTS_ENABLED = 'false';

    vi.doMock('@/lib/auth', async () => {
      const actual = await vi.importActual<any>('@/lib/auth');
      return {
        __esModule: true,
        ...actual,
        getCurrentUser: vi.fn(async () => null),
      };
    });

    vi.doMock('@/lib/psp/stripe', async () => {
      const actual = await vi.importActual<any>('@/lib/psp/stripe');
      return {
        __esModule: true,
        ...actual,

        verifyWebhookSignature: vi.fn((params: any) => {
          const rawBody = params?.rawBody;
          if (typeof rawBody !== 'string' || !rawBody.trim()) {
            throw new Error('TEST_INVALID_RAW_BODY');
          }
          return JSON.parse(rawBody);
        }),
      };
    });
    const productId = await pickActiveProductIdForCurrency('UAH');
    const idemKey =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `idem_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const { order } = await createOrderWithItems({
      items: [{ productId, quantity: 1 }],
      idempotencyKey: idemKey,
      userId: null,
      locale: 'uk',
    });

    const orderId: string = order.id;

    expect(orderId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );

    const row0 = (await db.execute(sql`
      select total_amount_minor, currency
      from orders
      where id = ${orderId}
      limit 1
    `)) as DbRows<{ total_amount_minor: number | string; currency: string }>;

    const expectedMinor = Number(row0.rows?.[0]?.total_amount_minor);
    const expectedCurrency = String(row0.rows?.[0]?.currency);

    expect(Number.isFinite(expectedMinor)).toBe(true);
    expect(expectedMinor).toBeGreaterThan(0);
    expect(expectedCurrency).toBe('UAH');

    const piId = `pi_test_mismatch_${orderId.slice(0, 8)}`;
    await db.execute(sql`
      update orders
      set payment_provider = 'stripe',
          payment_status = 'requires_payment',
          payment_intent_id = ${piId}
      where id = ${orderId}
    `);

    process.env.STRIPE_PAYMENTS_ENABLED = 'true';
    process.env.STRIPE_SECRET_KEY = 'stripe_secret_key_placeholder';
    process.env.STRIPE_WEBHOOK_SECRET = 'stripe_webhook_secret_placeholder';

    const evtId = `evt_mismatch_${orderId.slice(0, 8)}`;
    const actualMinor = expectedMinor + 1;

    const mockedEvent = {
      id: evtId,
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: piId,
          object: 'payment_intent',
          status: 'succeeded',
          currency: 'uah',
          amount: actualMinor,
          amount_received: actualMinor,
          metadata: { orderId },
        },
      },
    };

    const { POST: webhookPOST } =
      await import('@/app/api/shop/webhooks/stripe/route');

    const webhookRes = await webhookPOST(
      makeReq(
        'http://localhost/api/shop/webhooks/stripe',
        JSON.stringify(mockedEvent),
        {
          'stripe-signature': 't=0,v1=deadbeef',
        }
      )
    );

    expect([200, 202]).toContain(webhookRes.status);

    const row1 = (await db.execute(sql`
      select payment_status, psp_status_reason, psp_metadata
      from orders
      where id = ${orderId}
      limit 1
    `)) as DbRows<{
      payment_status: string;
      psp_status_reason: string | null;
      psp_metadata: unknown;
    }>;

    const paymentStatus = String(row1.rows?.[0]?.payment_status ?? '');
    const reason = row1.rows?.[0]?.psp_status_reason ?? null;
    const metaRaw = row1.rows?.[0]?.psp_metadata;

    expect(paymentStatus).not.toBe('paid');
    expect(reason && reason.length > 0).toBe(true);

    const metaObj =
      typeof metaRaw === 'string' ? JSON.parse(metaRaw) : (metaRaw ?? {});

    expect(metaObj?.mismatch?.eventId).toBe(evtId);
    expect(metaObj?.mismatch?.expected?.amountMinor).toBe(expectedMinor);
    expect(metaObj?.mismatch?.actual?.amountMinor).toBe(actualMinor);
    expect(String(metaObj?.mismatch?.expected?.currency)).toBe('UAH');
    expect(String(metaObj?.mismatch?.actual?.currency)).toBe('uah');
  }, 30_000);
});
