import crypto from 'node:crypto';

import { eq, type InferInsertModel } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
const createMonobankAttemptAndInvoiceMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/services/shop/order-access', () => ({
  authorizeOrderMutationAccess: authorizeOrderMutationAccessMock,
}));

vi.mock('@/lib/services/orders/monobank', () => ({
  createMonobankAttemptAndInvoice: createMonobankAttemptAndInvoiceMock,
}));

type RoutePost =
  (typeof import('@/app/api/shop/orders/[id]/payment/monobank/invoice/route'))['POST'];
let postRoute: RoutePost;

beforeAll(async () => {
  ({ POST: postRoute } =
    await import('@/app/api/shop/orders/[id]/payment/monobank/invoice/route'));
});

beforeEach(() => {
  vi.clearAllMocks();
  authorizeOrderMutationAccessMock.mockResolvedValue({
    authorized: true,
    actorUserId: null,
    code: 'OK',
    status: 200,
  });
  createMonobankAttemptAndInvoiceMock.mockResolvedValue({
    attemptId: 'attempt_invoice_scope_1',
    attemptNumber: 1,
    invoiceId: 'invoice_scope_1',
    pageUrl: 'https://pay.example.test/invoice_scope_1',
    currency: 'UAH',
    totalAmountMinor: 4321,
  });
});

async function insertOrder(
  orderId: string,
  paymentMethod: 'monobank_invoice' | 'monobank_google_pay' = 'monobank_invoice'
) {
  const values: InferInsertModel<typeof orders> = {
    id: orderId,
    totalAmountMinor: 4321,
    totalAmount: toDbMoney(4321),
    currency: 'UAH',
    paymentProvider: 'monobank',
    paymentStatus: 'pending',
    status: 'INVENTORY_RESERVED',
    inventoryStatus: 'reserved',
    idempotencyKey: `idem_${crypto.randomUUID()}`,
    pspPaymentMethod: paymentMethod,
    pspMetadata: {
      checkout: {
        requestedMethod: paymentMethod,
      },
    },
  };
  await db.insert(orders).values(values);
}

async function cleanupOrder(orderId: string) {
  await db.delete(orders).where(eq(orders.id, orderId));
}

function makeRequest(orderId: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/shop/orders/${orderId}/payment/monobank/invoice?statusToken=tok_test`,
    {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
        'content-type': 'application/json',
      },
    }
  );
}

describe.sequential('monobank invoice route scope policy', () => {
  it('requires order_payment_init scope and rejects insufficient scope', async () => {
    const orderId = crypto.randomUUID();
    await insertOrder(orderId);

    try {
      authorizeOrderMutationAccessMock.mockResolvedValueOnce({
        authorized: false,
        actorUserId: null,
        code: 'STATUS_TOKEN_SCOPE_FORBIDDEN',
        status: 403,
      });

      const denied = await postRoute(makeRequest(orderId), {
        params: Promise.resolve({ id: orderId }),
      });

      expect(denied.status).toBe(403);
      expect((await denied.json()).code).toBe('STATUS_TOKEN_SCOPE_FORBIDDEN');
      expect(createMonobankAttemptAndInvoiceMock).not.toHaveBeenCalled();
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

      const allowed = await postRoute(makeRequest(orderId), {
        params: Promise.resolve({ id: orderId }),
      });
      expect(allowed.status).toBe(200);
      const allowedJson: any = await allowed.json();
      expect(allowedJson.success).toBe(true);
      expect(allowedJson.orderId).toBe(orderId);
      expect(createMonobankAttemptAndInvoiceMock).toHaveBeenCalledTimes(1);
    } finally {
      await cleanupOrder(orderId);
    }
  });

  it('allows invoice fallback for wallet-intended monobank_google_pay orders', async () => {
    const orderId = crypto.randomUUID();
    await insertOrder(orderId, 'monobank_google_pay');

    try {
      const res = await postRoute(makeRequest(orderId), {
        params: Promise.resolve({ id: orderId }),
      });

      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.success).toBe(true);
      expect(json.orderId).toBe(orderId);
      expect(json.status).toBe('pending');
      expect(json.pageUrl).toBe('https://pay.example.test/invoice_scope_1');
      expect(createMonobankAttemptAndInvoiceMock).toHaveBeenCalledTimes(1);
    } finally {
      await cleanupOrder(orderId);
    }
  });
});
