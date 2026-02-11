import crypto from 'node:crypto';

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

function safeCurrencyLiteral(currency: 'USD' | 'UAH'): 'USD' | 'UAH' {
  return currency === 'UAH' ? 'UAH' : 'USD';
}

async function createStripeOrderFixture(args: { currency: 'USD' | 'UAH' }) {
  const currency = safeCurrencyLiteral(args.currency);

  const orderId = crypto.randomUUID();
  const totalMinor = 12_345; 
  const piId = `pi_test_mismatch_${orderId.slice(0, 8)}`;
  const idemKey = `test_${crypto.randomUUID()}`;
  const now = new Date();

  await db.execute(sql`
    insert into orders (
      id,
      user_id,
      total_amount_minor,
      total_amount,
      currency,
      payment_status,
      payment_provider,
      payment_intent_id,
      status,
      inventory_status,
      failure_code,
      failure_message,
      idempotency_key,
      idempotency_request_hash,
      stock_restored,
      restocked_at,
      updated_at
    ) values (
      ${orderId}::uuid,
      null,
      ${totalMinor},
      (${totalMinor}::numeric / 100),
      ${sql.raw(`'${currency}'`)},
      'requires_payment',
      'stripe',
      ${piId},
      'INVENTORY_RESERVED',
      'reserved',
      null,
      null,
      ${idemKey},
      ${`hash_${idemKey}`},
      false,
      null,
      ${now}
    )
  `);

  return { orderId, piId, totalMinor, currency };
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

  it(
    'mismatch: does NOT set paid and stores pspStatusReason + pspMetadata(expected/actual + event id)',
    async () => {
      process.env.PAYMENTS_ENABLED = 'true';
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

      const { orderId, piId, totalMinor, currency } =
        await createStripeOrderFixture({ currency: 'USD' });

      expect(orderId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );

      const row0 = (await db.execute(sql`
        select total_amount_minor, currency
        from orders
        where id = ${orderId}::uuid
        limit 1
      `)) as DbRows<{ total_amount_minor: number | string; currency: string }>;

      const expectedMinor = Number(row0.rows?.[0]?.total_amount_minor);
      const expectedCurrency = String(row0.rows?.[0]?.currency);

      expect(Number.isFinite(expectedMinor)).toBe(true);
      expect(expectedMinor).toBe(totalMinor);
      expect(expectedMinor).toBeGreaterThan(0);
      expect(expectedCurrency).toBe(currency);

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
            currency: 'usd',
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
          { 'stripe-signature': 't=0,v1=deadbeef' }
        )
      );

      expect([200, 202]).toContain(webhookRes.status);

      const row1 = (await db.execute(sql`
        select payment_status, psp_status_reason, psp_metadata
        from orders
        where id = ${orderId}::uuid
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
      expect(String(metaObj?.mismatch?.expected?.currency)).toBe(currency);
      expect(String(metaObj?.mismatch?.actual?.currency)).toBe('usd');

      await db.execute(sql`
        delete from orders
        where id = ${orderId}::uuid
      `);
    },
    30_000
  );
});
