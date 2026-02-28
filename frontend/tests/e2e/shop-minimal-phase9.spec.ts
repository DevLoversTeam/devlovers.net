import crypto from 'node:crypto';

import { expect, test } from '@playwright/test';
import { Pool } from 'pg';

import { createStatusToken } from '@/lib/shop/status-token';

const LOCAL_DB_URL = process.env.DATABASE_URL_LOCAL;
const STATUS_TOKEN_SECRET = process.env.SHOP_STATUS_TOKEN_SECRET;

if (!LOCAL_DB_URL?.trim() || !STATUS_TOKEN_SECRET?.trim()) {
  throw new Error(
    'E2E tests require DATABASE_URL_LOCAL and SHOP_STATUS_TOKEN_SECRET environment variables'
  );
}

const ALLOWED_LOCAL_DB_HOSTS = new Set(['localhost', '127.0.0.1']);
const localDbUrlRaw = LOCAL_DB_URL.trim();
let localDbUrlParsed: URL;
try {
  localDbUrlParsed = new URL(localDbUrlRaw);
} catch {
  throw new Error(
    'E2E DATABASE_URL_LOCAL must be a valid URL. Expected a postgresql:// URL string.'
  );
}

if (!ALLOWED_LOCAL_DB_HOSTS.has(localDbUrlParsed.hostname)) {
  throw new Error(
    `Refusing to run E2E against non-local DB host: ${localDbUrlParsed.hostname}`
  );
}

const pool = new Pool({ connectionString: localDbUrlRaw });

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
  const totalAmountMinor = args.totalAmountMinor ?? 1000;
  const currency = args.currency ?? 'UAH';
  const paymentProvider = args.paymentProvider ?? 'monobank';
  const paymentStatus = args.paymentStatus ?? 'pending';
  const status = args.status ?? 'INVENTORY_RESERVED';
  const inventoryStatus = args.inventoryStatus ?? 'reserved';
  const fulfillmentMode = args.fulfillmentMode ?? 'ua_np';
  const quoteStatus = args.quoteStatus ?? 'none';

  await pool.query(
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
}

async function cleanupOrder(orderId: string) {
  await pool.query('delete from admin_audit_log where order_id = $1::uuid', [
    orderId,
  ]);
  await pool.query('delete from payment_attempts where order_id = $1::uuid', [
    orderId,
  ]);
  await pool.query('delete from order_items where order_id = $1::uuid', [
    orderId,
  ]);
  await pool.query('delete from orders where id = $1::uuid', [orderId]);
}

test.describe('shop e2e minimal phase 9', () => {
  test.afterAll(async () => {
    await pool.end();
  });

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
