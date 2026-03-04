import crypto from 'node:crypto';

import { and, eq, inArray } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import { orders, paymentAttempts } from '@/db/schema';
import { toDbMoney } from '@/lib/shop/money';

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/services/shop/order-access', () => ({
  authorizeOrderMutationAccess: vi.fn(async () => ({
    authorized: true,
    actorUserId: null,
    code: 'OK',
    status: 200,
  })),
}));

vi.mock('@/lib/logging', async () => {
  const actual = await vi.importActual<any>('@/lib/logging');
  return {
    ...actual,
    logError: vi.fn(),
    logWarn: vi.fn(),
    logInfo: vi.fn(),
  };
});

const walletPaymentMock = vi.fn();

type WalletResult = {
  invoiceId: string | null;
  status: string | null;
  redirectUrl: string | null;
  modifiedDate: string | null;
  raw: unknown;
};

vi.mock('@/lib/psp/monobank', async () => {
  const actual = await vi.importActual<any>('@/lib/psp/monobank');
  return {
    ...actual,
    walletPayment: (...args: any[]) => walletPaymentMock(...args),
  };
});

let postRoute: typeof import('@/app/api/shop/orders/[id]/payment/monobank/google-pay/submit/route').POST;
let PspErrorCtor: typeof import('@/lib/psp/monobank').PspError;

const prevAppOrigin = process.env.APP_ORIGIN;
const prevShopBaseUrl = process.env.SHOP_BASE_URL;
const prevFlag = process.env.SHOP_MONOBANK_GPAY_ENABLED;
const prevMaxBody = process.env.SHOP_MONOBANK_GPAY_MAX_BODY_BYTES;

beforeAll(async () => {
  process.env.APP_ORIGIN = 'http://localhost:3000';
  delete process.env.SHOP_BASE_URL;
  process.env.SHOP_MONOBANK_GPAY_ENABLED = 'true';
  delete process.env.SHOP_MONOBANK_GPAY_MAX_BODY_BYTES;

  ({ POST: postRoute } =
    await import('@/app/api/shop/orders/[id]/payment/monobank/google-pay/submit/route'));
  ({ PspError: PspErrorCtor } = await import('@/lib/psp/monobank'));
});

afterAll(() => {
  if (prevAppOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = prevAppOrigin;

  if (prevShopBaseUrl === undefined) delete process.env.SHOP_BASE_URL;
  else process.env.SHOP_BASE_URL = prevShopBaseUrl;

  if (prevFlag === undefined) delete process.env.SHOP_MONOBANK_GPAY_ENABLED;
  else process.env.SHOP_MONOBANK_GPAY_ENABLED = prevFlag;

  if (prevMaxBody === undefined) delete process.env.SHOP_MONOBANK_GPAY_MAX_BODY_BYTES;
  else process.env.SHOP_MONOBANK_GPAY_MAX_BODY_BYTES = prevMaxBody;
});

beforeEach(() => {
  walletPaymentMock.mockReset();
  process.env.SHOP_MONOBANK_GPAY_ENABLED = 'true';
  delete process.env.SHOP_MONOBANK_GPAY_MAX_BODY_BYTES;
});

async function insertOrder(args: {
  id: string;
  paymentProvider?: 'monobank' | 'stripe';
  paymentStatus?: 'pending' | 'requires_payment' | 'paid' | 'failed' | 'refunded';
  currency?: 'UAH' | 'USD';
  paymentMethod?: 'monobank_google_pay' | 'monobank_invoice' | 'stripe_card';
}) {
  await db.insert(orders).values({
    id: args.id,
    totalAmountMinor: 4321,
    totalAmount: toDbMoney(4321),
    currency: args.currency ?? 'UAH',
    paymentProvider: args.paymentProvider ?? 'monobank',
    paymentStatus: args.paymentStatus ?? 'pending',
    status: 'INVENTORY_RESERVED',
    inventoryStatus: 'reserved',
    idempotencyKey: `idem_${crypto.randomUUID()}`,
    pspPaymentMethod: args.paymentMethod ?? 'monobank_google_pay',
    pspMetadata: {
      checkout: {
        requestedMethod: args.paymentMethod ?? 'monobank_google_pay',
      },
    },
  } as any);
}

async function cleanupOrder(orderId: string) {
  await db.delete(paymentAttempts).where(eq(paymentAttempts.orderId, orderId));
  await db.delete(orders).where(eq(orders.id, orderId));
}

function makeSubmitRequest(args: {
  orderId: string;
  idempotencyKey?: string;
  body: string;
}) {
  const headers = new Headers({
    origin: 'http://localhost:3000',
    'content-type': 'application/json',
  });
  if (args.idempotencyKey) {
    headers.set('idempotency-key', args.idempotencyKey);
  }

  return new NextRequest(
    `http://localhost/api/shop/orders/${args.orderId}/payment/monobank/google-pay/submit?statusToken=tok_test`,
    {
      method: 'POST',
      headers,
      body: args.body,
    }
  );
}

async function waitForCreatingAttempt(orderId: string, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [attempt] = await db
      .select({
        id: paymentAttempts.id,
        status: paymentAttempts.status,
      })
      .from(paymentAttempts)
      .where(
        and(
          eq(paymentAttempts.orderId, orderId),
          eq(paymentAttempts.provider, 'monobank')
        )
      )
      .limit(1);

    if (attempt && attempt.status === 'creating') return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for creating payment attempt');
}

describe.sequential('monobank google pay submit route', () => {
  it('enforces payload cap before JSON.parse', async () => {
    const orderId = crypto.randomUUID();
    await insertOrder({ id: orderId });
    process.env.SHOP_MONOBANK_GPAY_MAX_BODY_BYTES = '64';

    const big = JSON.stringify({ gToken: `token_${'x'.repeat(200)}` });
    try {
      const res = await postRoute(
        makeSubmitRequest({
          orderId,
          idempotencyKey: 'mono_submit_cap_test_key_0001',
          body: big,
        }),
        { params: Promise.resolve({ id: orderId }) }
      );

      expect(res.status).toBe(413);
      const json: any = await res.json();
      expect(json.code).toBe('PAYLOAD_TOO_LARGE');
      expect(walletPaymentMock).not.toHaveBeenCalled();
    } finally {
      await cleanupOrder(orderId);
    }
  });

  it('formats token via parse/stringify fallback and never persists raw token', async () => {
    const orderJsonToken = crypto.randomUUID();
    const orderRawToken = crypto.randomUUID();
    await insertOrder({ id: orderJsonToken });
    await insertOrder({ id: orderRawToken });

    walletPaymentMock
      .mockResolvedValueOnce({
        invoiceId: 'inv_json_1',
        status: 'created',
        redirectUrl: null,
        modifiedDate: null,
        raw: {},
      })
      .mockResolvedValueOnce({
        invoiceId: 'inv_raw_1',
        status: 'created',
        redirectUrl: null,
        modifiedDate: null,
        raw: {},
      });

    try {
      const jsonTokenMarker = `tok_json_${crypto.randomUUID()}`;
      const resJson = await postRoute(
        makeSubmitRequest({
          orderId: orderJsonToken,
          idempotencyKey: 'mono_submit_parse_json_key_0001',
          body: JSON.stringify({
            gToken: ` { "payload":"${jsonTokenMarker}", "v":1 } `,
          }),
        }),
        { params: Promise.resolve({ id: orderJsonToken }) }
      );
      expect(resJson.status).toBe(200);

      const firstCallArgs = walletPaymentMock.mock.calls[0]?.[0];
      expect(firstCallArgs.cardToken).toBe(
        JSON.stringify({ payload: jsonTokenMarker, v: 1 })
      );
      expect(firstCallArgs.ccy).toBe(980);

      const rawTokenMarker = `tok_raw_${crypto.randomUUID()}`;
      const resRaw = await postRoute(
        makeSubmitRequest({
          orderId: orderRawToken,
          idempotencyKey: 'mono_submit_parse_raw_key_0001',
          body: JSON.stringify({ gToken: rawTokenMarker }),
        }),
        { params: Promise.resolve({ id: orderRawToken }) }
      );
      expect(resRaw.status).toBe(200);

      const secondCallArgs = walletPaymentMock.mock.calls[1]?.[0];
      expect(secondCallArgs.cardToken).toBe(rawTokenMarker);

      const attempts = await db
        .select({
          orderId: paymentAttempts.orderId,
          metadata: paymentAttempts.metadata,
        })
        .from(paymentAttempts)
        .where(inArray(paymentAttempts.orderId, [orderJsonToken, orderRawToken]));

      const serializedMeta = JSON.stringify(attempts);
      expect(serializedMeta).not.toContain(jsonTokenMarker);
      expect(serializedMeta).not.toContain(rawTokenMarker);
    } finally {
      await cleanupOrder(orderJsonToken);
      await cleanupOrder(orderRawToken);
    }
  });

  it('same order + same idempotency key returns same result and no second PSP call', async () => {
    const orderId = crypto.randomUUID();
    await insertOrder({ id: orderId });

    walletPaymentMock.mockResolvedValue({
      invoiceId: 'inv_replay_1',
      status: 'created',
      redirectUrl: 'https://pay.example.test/3ds',
      modifiedDate: null,
      raw: {},
    });

    try {
      const requestKey = 'mono_submit_replay_key_0001';
      const req = () =>
        makeSubmitRequest({
          orderId,
          idempotencyKey: requestKey,
          body: JSON.stringify({ gToken: `token_${crypto.randomUUID()}` }),
        });

      const first = await postRoute(req(), {
        params: Promise.resolve({ id: orderId }),
      });
      const second = await postRoute(req(), {
        params: Promise.resolve({ id: orderId }),
      });

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(walletPaymentMock).toHaveBeenCalledTimes(1);

      const secondJson: any = await second.json();
      expect(secondJson.reused).toBe(true);
      expect(secondJson.status).toBe('pending');
    } finally {
      await cleanupOrder(orderId);
    }
  });

  it('concurrent different keys for same active attempt returns 409 conflict', async () => {
    const orderId = crypto.randomUUID();
    await insertOrder({ id: orderId });

    let release!: (value: WalletResult) => void;
    const hold = new Promise<WalletResult>(resolve => {
      release = resolve;
    });

    walletPaymentMock.mockImplementationOnce(async () => {
      return await hold;
    });

    try {
      const leaderPromise = postRoute(
        makeSubmitRequest({
          orderId,
          idempotencyKey: 'mono_submit_conflict_key_a_0001',
          body: JSON.stringify({ gToken: 'token-a' }),
        }),
        { params: Promise.resolve({ id: orderId }) }
      );

      await waitForCreatingAttempt(orderId);

      const follower = await postRoute(
        makeSubmitRequest({
          orderId,
          idempotencyKey: 'mono_submit_conflict_key_b_0001',
          body: JSON.stringify({ gToken: 'token-b' }),
        }),
        { params: Promise.resolve({ id: orderId }) }
      );

      expect(follower.status).toBe(409);
      expect((await follower.json()).code).toBe('MONOBANK_WALLET_CONFLICT');

      release({
        invoiceId: 'inv_conflict_1',
        status: 'created',
        redirectUrl: null,
        modifiedDate: null,
        raw: {},
      });

      const leader = await leaderPromise;
      expect(leader.status).toBe(200);
      expect(walletPaymentMock).toHaveBeenCalledTimes(1);
    } finally {
      await cleanupOrder(orderId);
    }
  }, 15_000);

  it('enforces flag/provider/currency/method compatibility guards', async () => {
    const disabledOrderId = crypto.randomUUID();
    const providerOrderId = crypto.randomUUID();
    const currencyOrderId = crypto.randomUUID();
    const methodOrderId = crypto.randomUUID();

    await insertOrder({ id: disabledOrderId });
    await insertOrder({
      id: providerOrderId,
      paymentProvider: 'stripe',
      paymentMethod: 'stripe_card',
      currency: 'USD',
    });
    await insertOrder({
      id: currencyOrderId,
      paymentProvider: 'monobank',
      paymentMethod: 'monobank_google_pay',
      currency: 'USD',
    });
    await insertOrder({
      id: methodOrderId,
      paymentProvider: 'monobank',
      paymentMethod: 'monobank_invoice',
      currency: 'UAH',
    });

    try {
      process.env.SHOP_MONOBANK_GPAY_ENABLED = 'false';
      const disabled = await postRoute(
        makeSubmitRequest({
          orderId: disabledOrderId,
          idempotencyKey: 'mono_submit_flag_guard_0001',
          body: JSON.stringify({ gToken: 'token-disabled' }),
        }),
        { params: Promise.resolve({ id: disabledOrderId }) }
      );
      expect(disabled.status).toBe(409);
      expect((await disabled.json()).code).toBe('MONOBANK_GPAY_DISABLED');

      process.env.SHOP_MONOBANK_GPAY_ENABLED = 'true';

      const provider = await postRoute(
        makeSubmitRequest({
          orderId: providerOrderId,
          idempotencyKey: 'mono_submit_provider_guard_0001',
          body: JSON.stringify({ gToken: 'token-provider' }),
        }),
        { params: Promise.resolve({ id: providerOrderId }) }
      );
      expect(provider.status).toBe(409);
      expect((await provider.json()).code).toBe('PAYMENT_PROVIDER_NOT_ALLOWED');

      const currency = await postRoute(
        makeSubmitRequest({
          orderId: currencyOrderId,
          idempotencyKey: 'mono_submit_currency_guard_0001',
          body: JSON.stringify({ gToken: 'token-currency' }),
        }),
        { params: Promise.resolve({ id: currencyOrderId }) }
      );
      expect(currency.status).toBe(409);
      expect((await currency.json()).code).toBe('ORDER_CURRENCY_NOT_SUPPORTED');

      const method = await postRoute(
        makeSubmitRequest({
          orderId: methodOrderId,
          idempotencyKey: 'mono_submit_method_guard_0001',
          body: JSON.stringify({ gToken: 'token-method' }),
        }),
        { params: Promise.resolve({ id: methodOrderId }) }
      );
      expect(method.status).toBe(409);
      expect((await method.json()).code).toBe('PAYMENT_METHOD_NOT_ALLOWED');
      expect(walletPaymentMock).not.toHaveBeenCalled();
    } finally {
      await cleanupOrder(disabledOrderId);
      await cleanupOrder(providerOrderId);
      await cleanupOrder(currencyOrderId);
      await cleanupOrder(methodOrderId);
    }
  });

  it('returns pending/unknown on PSP timeout without retries', async () => {
    const orderId = crypto.randomUUID();
    await insertOrder({ id: orderId });

    walletPaymentMock.mockRejectedValueOnce(
      new PspErrorCtor('PSP_TIMEOUT', 'timeout')
    );

    try {
      const res = await postRoute(
        makeSubmitRequest({
          orderId,
          idempotencyKey: 'mono_submit_unknown_0001',
          body: JSON.stringify({ gToken: 'token-timeout' }),
        }),
        { params: Promise.resolve({ id: orderId }) }
      );

      expect(res.status).toBe(202);
      const json: any = await res.json();
      expect(json.submitOutcome).toBe('unknown');
      expect(json.status).toBe('pending');
      expect(walletPaymentMock).toHaveBeenCalledTimes(1);
    } finally {
      await cleanupOrder(orderId);
    }
  });
});
