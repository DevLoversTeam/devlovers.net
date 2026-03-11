import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { db } from '@/db';
import { orders } from '@/db/schema';
import { toDbMoney } from '@/lib/shop/money';

const authorizeOrderMutationAccessMock = vi.hoisted(() =>
  vi.fn(async () => ({
    authorized: true,
    actorUserId: null,
    code: 'OK',
    status: 200,
  }))
);

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/services/shop/order-access', () => ({
  authorizeOrderMutationAccess: authorizeOrderMutationAccessMock,
}));

let getRoute: typeof import('@/app/api/shop/orders/[id]/payment/monobank/google-pay/config/route').GET;

const prevFlag = process.env.SHOP_MONOBANK_GPAY_ENABLED;
const prevGatewayMerchantId = process.env.MONO_GOOGLE_PAY_GATEWAY_MERCHANT_ID;
const prevMerchantName = process.env.MONO_GOOGLE_PAY_MERCHANT_NAME;

beforeAll(async () => {
  process.env.SHOP_MONOBANK_GPAY_ENABLED = 'true';
  process.env.MONO_GOOGLE_PAY_GATEWAY_MERCHANT_ID = 'mono-gateway-mid';
  process.env.MONO_GOOGLE_PAY_MERCHANT_NAME = 'Devlovers Test Merchant';
  ({ GET: getRoute } =
    await import('@/app/api/shop/orders/[id]/payment/monobank/google-pay/config/route'));
});

afterAll(() => {
  if (prevFlag === undefined) delete process.env.SHOP_MONOBANK_GPAY_ENABLED;
  else process.env.SHOP_MONOBANK_GPAY_ENABLED = prevFlag;

  if (prevGatewayMerchantId === undefined)
    delete process.env.MONO_GOOGLE_PAY_GATEWAY_MERCHANT_ID;
  else process.env.MONO_GOOGLE_PAY_GATEWAY_MERCHANT_ID = prevGatewayMerchantId;

  if (prevMerchantName === undefined)
    delete process.env.MONO_GOOGLE_PAY_MERCHANT_NAME;
  else process.env.MONO_GOOGLE_PAY_MERCHANT_NAME = prevMerchantName;
});

beforeEach(() => {
  authorizeOrderMutationAccessMock.mockReset();
  authorizeOrderMutationAccessMock.mockResolvedValue({
    authorized: true,
    actorUserId: null,
    code: 'OK',
    status: 200,
  });
  process.env.SHOP_MONOBANK_GPAY_ENABLED = 'true';
  process.env.MONO_GOOGLE_PAY_GATEWAY_MERCHANT_ID = 'mono-gateway-mid';
  process.env.MONO_GOOGLE_PAY_MERCHANT_NAME = 'Devlovers Test Merchant';
});

async function insertOrder(args: {
  id: string;
  paymentProvider?: 'monobank' | 'stripe';
  paymentStatus?:
    | 'pending'
    | 'requires_payment'
    | 'paid'
    | 'failed'
    | 'refunded';
  currency?: 'UAH' | 'USD';
  totalAmountMinor?: number;
  paymentMethod?:
    | 'monobank_google_pay'
    | 'monobank_invoice'
    | 'stripe_card'
    | null;
}) {
  await db.insert(orders).values({
    id: args.id,
    totalAmountMinor: args.totalAmountMinor ?? 12345,
    totalAmount: toDbMoney(args.totalAmountMinor ?? 12345),
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
  await db.delete(orders).where(eq(orders.id, orderId));
}

function makeRequest(orderId: string) {
  return new NextRequest(
    `http://localhost/api/shop/orders/${orderId}/payment/monobank/google-pay/config?statusToken=tok_test`,
    {
      method: 'GET',
      headers: {
        origin: 'http://localhost:3000',
      },
    }
  );
}

describe.sequential('monobank google pay config route', () => {
  it('returns server-authoritative PaymentDataRequest with decimal totalPrice and UAH currencyCode', async () => {
    const orderId = crypto.randomUUID();
    await insertOrder({
      id: orderId,
      totalAmountMinor: 12345,
      currency: 'UAH',
      paymentProvider: 'monobank',
      paymentMethod: 'monobank_google_pay',
    });

    try {
      const res = await getRoute(makeRequest(orderId), {
        params: Promise.resolve({ id: orderId }),
      });

      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.success).toBe(true);
      expect(json.orderId).toBe(orderId);

      expect(json.paymentDataRequest.transactionInfo.totalPrice).toBe('123.45');
      expect(json.paymentDataRequest.transactionInfo.currencyCode).toBe('UAH');
      expect(
        json.paymentDataRequest.allowedPaymentMethods[0]
          .tokenizationSpecification
      ).toEqual({
        type: 'PAYMENT_GATEWAY',
        parameters: {
          gateway: 'monobank',
          gatewayMerchantId: 'mono-gateway-mid',
        },
      });
      expect(json.paymentDataRequest.merchantInfo.merchantName).toBe(
        'Devlovers Test Merchant'
      );
    } finally {
      await cleanupOrder(orderId);
    }
  });

  it('enforces feature flag and order provider/currency/method guards', async () => {
    const flagOrderId = crypto.randomUUID();
    const providerOrderId = crypto.randomUUID();
    const currencyOrderId = crypto.randomUUID();
    const methodOrderId = crypto.randomUUID();

    await insertOrder({ id: flagOrderId });
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
      const flagRes = await getRoute(makeRequest(flagOrderId), {
        params: Promise.resolve({ id: flagOrderId }),
      });
      expect(flagRes.status).toBe(409);
      expect((await flagRes.json()).code).toBe('MONOBANK_GPAY_DISABLED');

      process.env.SHOP_MONOBANK_GPAY_ENABLED = 'true';

      const providerRes = await getRoute(makeRequest(providerOrderId), {
        params: Promise.resolve({ id: providerOrderId }),
      });
      expect(providerRes.status).toBe(409);
      expect((await providerRes.json()).code).toBe(
        'PAYMENT_PROVIDER_NOT_ALLOWED'
      );

      const currencyRes = await getRoute(makeRequest(currencyOrderId), {
        params: Promise.resolve({ id: currencyOrderId }),
      });
      expect(currencyRes.status).toBe(409);
      expect((await currencyRes.json()).code).toBe(
        'ORDER_CURRENCY_NOT_SUPPORTED'
      );

      const methodRes = await getRoute(makeRequest(methodOrderId), {
        params: Promise.resolve({ id: methodOrderId }),
      });
      expect(methodRes.status).toBe(409);
      expect((await methodRes.json()).code).toBe('PAYMENT_METHOD_NOT_ALLOWED');
    } finally {
      await cleanupOrder(flagOrderId);
      await cleanupOrder(providerOrderId);
      await cleanupOrder(currencyOrderId);
      await cleanupOrder(methodOrderId);
    }
  });

  it('requires order_payment_init scope and rejects insufficient scope', async () => {
    const orderId = crypto.randomUUID();
    await insertOrder({ id: orderId });

    try {
      authorizeOrderMutationAccessMock.mockResolvedValueOnce({
        authorized: false,
        actorUserId: null,
        code: 'STATUS_TOKEN_SCOPE_FORBIDDEN',
        status: 403,
      });

      const denied = await getRoute(makeRequest(orderId), {
        params: Promise.resolve({ id: orderId }),
      });

      expect(denied.status).toBe(403);
      expect((await denied.json()).code).toBe('STATUS_TOKEN_SCOPE_FORBIDDEN');
      expect(authorizeOrderMutationAccessMock).toHaveBeenCalledWith({
        orderId,
        statusToken: 'tok_test',
        requiredScope: 'order_payment_init',
      });

      authorizeOrderMutationAccessMock.mockResolvedValueOnce({
        authorized: true,
        actorUserId: null,
        code: 'OK',
        status: 200,
      });

      const allowed = await getRoute(makeRequest(orderId), {
        params: Promise.resolve({ id: orderId }),
      });
      expect(allowed.status).toBe(200);
    } finally {
      await cleanupOrder(orderId);
    }
  });
});
