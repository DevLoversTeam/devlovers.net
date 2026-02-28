import crypto from 'node:crypto';

import { expect, test } from '@playwright/test';
import { Client } from 'pg';

const LOCAL_DB_URL =
  process.env.DATABASE_URL_LOCAL ??
  'postgresql://devlovers_local:Gfdtkk43@localhost:5432/devlovers_shop_local_clean?sslmode=disable';
const STATUS_TOKEN_SECRET =
  process.env.SHOP_STATUS_TOKEN_SECRET ??
  'test_status_token_secret_test_status_token_secret';

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function createStatusToken(args: {
  orderId: string;
  scopes?: string[];
  ttlSeconds?: number;
}): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    v: 1,
    orderId: args.orderId,
    iat: nowSeconds,
    exp: nowSeconds + (args.ttlSeconds ?? 45 * 60),
    nonce: crypto.randomUUID(),
    scp: args.scopes ?? ['status_lite'],
  };

  const body = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const sig = base64UrlEncode(
    crypto.createHmac('sha256', STATUS_TOKEN_SECRET).update(body).digest()
  );
  return `${body}.${sig}`;
}

async function insertOrder(args: {
  orderId: string;
  currency?: 'USD' | 'UAH';
  totalAmountMinor?: number;
  paymentProvider?: 'stripe' | 'monobank';
  paymentStatus?:
    | 'pending'
    | 'requires_payment'
    | 'paid'
    | 'failed'
    | 'refunded'
    | 'needs_review';
  status?:
    | 'CREATED'
    | 'INVENTORY_RESERVED'
    | 'INVENTORY_FAILED'
    | 'PAID'
    | 'CANCELED';
  inventoryStatus?:
    | 'none'
    | 'reserving'
    | 'reserved'
    | 'release_pending'
    | 'released'
    | 'failed';
  fulfillmentMode?: 'ua_np' | 'intl';
  quoteStatus?:
    | 'none'
    | 'requested'
    | 'offered'
    | 'accepted'
    | 'declined'
    | 'expired'
    | 'requires_requote';
}) {
  const client = new Client({ connectionString: LOCAL_DB_URL });
  await client.connect();
  try {
    const totalAmountMinor = args.totalAmountMinor ?? 1000;
    const currency = args.currency ?? 'UAH';
    const paymentProvider = args.paymentProvider ?? 'monobank';
    const paymentStatus = args.paymentStatus ?? 'pending';
    const status = args.status ?? 'INVENTORY_RESERVED';
    const inventoryStatus = args.inventoryStatus ?? 'reserved';
    const fulfillmentMode = args.fulfillmentMode ?? 'ua_np';
    const quoteStatus = args.quoteStatus ?? 'none';

    await client.query(
      `
      insert into orders (
        id,
        user_id,
        idempotency_key,
        currency,
        total_amount,
        total_amount_minor,
        payment_provider,
        payment_status,
        status,
        inventory_status,
        fulfillment_mode,
        quote_status,
        items_subtotal_minor,
        created_at,
        updated_at
      )
      values (
        $1::uuid,
        null,
        $2,
        $3,
        ($4::numeric / 100),
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $4,
        now(),
        now()
      )
      `,
      [
        args.orderId,
        `e2e:${args.orderId}`,
        currency,
        totalAmountMinor,
        paymentProvider,
        paymentStatus,
        status,
        inventoryStatus,
        fulfillmentMode,
        quoteStatus,
      ]
    );
  } finally {
    await client.end();
  }
}

async function cleanupOrder(orderId: string) {
  const client = new Client({ connectionString: LOCAL_DB_URL });
  await client.connect();
  try {
    await client.query('delete from admin_audit_log where order_id = $1::uuid', [
      orderId,
    ]);
    await client.query('delete from payment_attempts where order_id = $1::uuid', [
      orderId,
    ]);
    await client.query('delete from order_items where order_id = $1::uuid', [
      orderId,
    ]);
    await client.query('delete from orders where id = $1::uuid', [orderId]);
  } finally {
    await client.end();
  }
}

test.describe('shop e2e minimal phase 9', () => {
  test('flow 1: guest status endpoint requires token', async ({ request }) => {
    const orderId = crypto.randomUUID();
    await insertOrder({ orderId });

    try {
      const res = await request.get(`/api/shop/orders/${orderId}/status?view=lite`);
      expect(res.status()).toBe(401);
      const body = await res.json();
      expect(body.code).toBe('STATUS_TOKEN_REQUIRED');
    } finally {
      await cleanupOrder(orderId);
    }
  });

  test('flow 2: guest token with status_lite scope reads status', async ({
    request,
  }) => {
    const orderId = crypto.randomUUID();
    await insertOrder({
      orderId,
      currency: 'UAH',
      totalAmountMinor: 4200,
      paymentProvider: 'monobank',
      paymentStatus: 'pending',
    });

    try {
      const token = createStatusToken({
        orderId,
        scopes: ['status_lite'],
      });

      const res = await request.get(
        `/api/shop/orders/${orderId}/status?view=lite&statusToken=${encodeURIComponent(
          token
        )}`
      );

      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(orderId);
      expect(body.currency).toBe('UAH');
      expect(body.totalAmountMinor).toBe(4200);
      expect(body.paymentStatus).toBe('pending');
      expect(typeof body.itemsCount).toBe('number');
    } finally {
      await cleanupOrder(orderId);
    }
  });

  test('flow 3: payment init rejects token without order_payment_init scope', async ({
    request,
  }) => {
    const orderId = crypto.randomUUID();
    await insertOrder({
      orderId,
      currency: 'USD',
      paymentProvider: 'stripe',
      paymentStatus: 'pending',
      fulfillmentMode: 'ua_np',
      quoteStatus: 'none',
      inventoryStatus: 'reserved',
    });

    try {
      const token = createStatusToken({
        orderId,
        scopes: ['status_lite'],
      });

      const res = await request.post(
        `/api/shop/orders/${orderId}/payment/init?statusToken=${encodeURIComponent(
          token
        )}`,
        {
          headers: {
            origin: 'http://localhost:3000',
            'content-type': 'application/json',
          },
          data: { provider: 'stripe' },
        }
      );

      expect(res.status()).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('STATUS_TOKEN_SCOPE_FORBIDDEN');
    } finally {
      await cleanupOrder(orderId);
    }
  });
});
