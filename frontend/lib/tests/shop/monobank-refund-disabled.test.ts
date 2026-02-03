import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import { orders } from '@/db/schema';
import { resetEnvCache } from '@/lib/env';
import { toDbMoney } from '@/lib/shop/money';

vi.mock('@/lib/auth/admin', () => ({
  requireAdminApi: vi.fn(async () => {}),
  AdminApiDisabledError: class AdminApiDisabledError extends Error {},
  AdminUnauthorizedError: class AdminUnauthorizedError extends Error {
    code = 'ADMIN_UNAUTHORIZED';
  },
  AdminForbiddenError: class AdminForbiddenError extends Error {
    code = 'ADMIN_FORBIDDEN';
  },
}));

vi.mock('@/lib/security/admin-csrf', () => ({
  requireAdminCsrf: vi.fn(() => null),
}));

vi.mock('@/lib/services/orders', () => ({
  refundOrder: vi.fn(async () => {
    throw new Error('refundOrder should not be called');
  }),
}));

vi.mock('@/lib/logging', async () => {
  const actual = await vi.importActual<any>('@/lib/logging');
  return {
    ...actual,
    logWarn: () => {},
    logError: () => {},
  };
});

const __prevRefundEnabled = process.env.MONO_REFUND_ENABLED;
const __prevAppOrigin = process.env.APP_ORIGIN;
beforeAll(() => {
  process.env.MONO_REFUND_ENABLED = 'false';
  process.env.APP_ORIGIN = 'http://localhost:3000';
  resetEnvCache();
});

afterAll(() => {
  if (__prevRefundEnabled === undefined) delete process.env.MONO_REFUND_ENABLED;
  else process.env.MONO_REFUND_ENABLED = __prevRefundEnabled;

  if (__prevAppOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = __prevAppOrigin;

  resetEnvCache();
});

async function insertOrder(orderId: string) {
  await db.insert(orders).values({
    id: orderId,
    totalAmountMinor: 1000,
    totalAmount: toDbMoney(1000),
    currency: 'UAH',
    paymentProvider: 'monobank',
    paymentStatus: 'paid',
    status: 'PAID',
    inventoryStatus: 'released',
    idempotencyKey: crypto.randomUUID(),
  } as any);
}

async function deleteOrder(orderId: string) {
  await db.delete(orders).where(eq(orders.id, orderId));
}

describe.sequential('monobank refund disabled guard', () => {
  it('returns 409 REFUND_DISABLED for monobank orders', async () => {
    const orderId = crypto.randomUUID();
    await insertOrder(orderId);

    try {
      const { POST } =
        await import('@/app/api/shop/admin/orders/[id]/refund/route');
      const req = new NextRequest(
        `http://localhost/api/shop/admin/orders/${orderId}/refund`,
        {
          method: 'POST',
          headers: {
            origin: 'http://localhost:3000',
          },
        }
      );

      const res = await POST(req, {
        params: Promise.resolve({ id: orderId }),
      });

      expect(res.status).toBe(409);
      const json: any = await res.json();
      expect(json.code).toBe('REFUND_DISABLED');
      expect(json.message).toBe('Refunds are disabled.');
    } finally {
      await deleteOrder(orderId);
    }
  });
});
