import { sql } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';

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
  const res = (await db.execute(sql`
    select p.id
    from products p
    inner join product_prices pp
      on pp.product_id = p.id
     and pp.currency = ${currency}
    where p.is_active = true
      and p.stock > 0
      and pp.price_minor > 0
    order by p.updated_at desc
    limit 1
  `)) as DbRows<{ id: string }>;

  const id = res.rows?.[0]?.id;
  if (!id) {
    throw new Error(
      `No active product found for currency=${currency}. Ensure DB has products.is_active=true, stock>0, and product_prices row.`
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
    /**
     * 1) Create an order with payments disabled (so no Stripe network calls).
     */
    process.env.STRIPE_PAYMENTS_ENABLED = 'false';

    vi.doMock('@/lib/auth', async () => {
      const actual = await vi.importActual<any>('@/lib/auth');
      return {
        __esModule: true,
        ...actual,
        getCurrentUser: vi.fn(async () => null),
      };
    });

    // IMPORTANT: mock stripe module BEFORE importing ANY route modules
    // so webhook route doesn't cache the real module.
    vi.doMock('@/lib/psp/stripe', async () => {
      const actual = await vi.importActual<any>('@/lib/psp/stripe');
      return {
        __esModule: true,
        ...actual,
        // IMPORTANT: route.ts calls this SYNC (no await). So mock MUST be sync.
        verifyWebhookSignature: vi.fn((params: any) => {
          const rawBody = params?.rawBody;
          if (typeof rawBody !== 'string' || !rawBody.trim()) {
            throw new Error('TEST_INVALID_RAW_BODY');
          }
          return JSON.parse(rawBody);
        }),
      };
    });
    const { POST: checkoutPOST } = await import(
      '@/app/api/shop/checkout/route'
    );

    const productId = await pickActiveProductIdForCurrency('UAH');
    const idemKey =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `idem_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const checkoutBody = JSON.stringify({
      items: [{ productId, quantity: 1 }],
    });

    const checkoutRes = await checkoutPOST(
      makeReq('http://localhost/api/shop/checkout', checkoutBody, {
        'accept-language': 'uk-UA,uk;q=0.9',
        'idempotency-key': idemKey,
        origin: 'http://localhost:3000',
      })
    );

    expect([200, 201]).toContain(checkoutRes.status);

    const checkoutJson: any = await checkoutRes.json();
    expect(checkoutJson?.success).toBe(true);

    const orderId: string =
      checkoutJson?.order?.id ?? checkoutJson?.orderId ?? '';
    expect(orderId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );

    /**
     * 2) Read expected total_amount_minor + currency from DB.
     */
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

    /**
     * 3) Turn this order into a "Stripe" order in DB (no real Stripe PI needed).
     */
    const piId = `pi_test_mismatch_${orderId.slice(0, 8)}`;
    await db.execute(sql`
      update orders
      set payment_provider = 'stripe',
          payment_status = 'requires_payment',
          payment_intent_id = ${piId}
      where id = ${orderId}
    `);

    /**
     * 4) Prepare mocked Stripe event with mismatched amount (expectedMinor + 1).
     *    We mock verifyWebhookSignature so we don't need real Stripe signature.
     */
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

    const { POST: webhookPOST } = await import(
      '@/app/api/shop/webhooks/stripe/route'
    );

    const webhookRes = await webhookPOST(
      makeReq(
        'http://localhost/api/shop/webhooks/stripe',
        JSON.stringify(mockedEvent),
        {
          'stripe-signature': 't=0,v1=deadbeef',
        }
      )
    );

    // webhook handler should accept the event and record mismatch (usually 200)
    expect([200, 202]).toContain(webhookRes.status);

    /**
     * 5) Assert DB: not paid + pspStatusReason set + pspMetadata contains expected/actual + event id.
     */
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
      typeof metaRaw === 'string' ? JSON.parse(metaRaw) : metaRaw ?? {};

    expect(metaObj?.mismatch?.eventId).toBe(evtId);
    expect(metaObj?.mismatch?.expected?.amountMinor).toBe(expectedMinor);
    expect(metaObj?.mismatch?.actual?.amountMinor).toBe(actualMinor);
    expect(String(metaObj?.mismatch?.expected?.currency)).toBe('UAH');
    expect(String(metaObj?.mismatch?.actual?.currency)).toBe('uah');
  }, 30_000);
});
