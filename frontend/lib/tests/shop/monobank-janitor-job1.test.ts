import crypto from 'node:crypto';

import { eq, or } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import { monobankEvents, orders, paymentAttempts } from '@/db/schema';
import { buildMonobankAttemptIdempotencyKey } from '@/lib/services/orders/attempt-idempotency';
import { runMonobankJanitorJob1 } from '@/lib/services/orders/monobank-janitor';
import { toDbMoney } from '@/lib/shop/money';

const getInvoiceStatusMock = vi.fn();

vi.mock('@/lib/psp/monobank', async () => {
  const actual = await vi.importActual<any>('@/lib/psp/monobank');
  return {
    ...actual,
    getInvoiceStatus: (...args: unknown[]) => getInvoiceStatusMock(...args),
  };
});

vi.mock('@/lib/logging', async () => {
  const actual = await vi.importActual<any>('@/lib/logging');
  return {
    ...actual,
    logInfo: () => {},
    logWarn: () => {},
    logError: () => {},
  };
});

async function insertOrderAndAttempt(args: {
  invoiceId: string;
  attemptStatus?: 'creating' | 'active';
  updatedAt: Date;
  amountMinor?: number;
}) {
  const orderId = crypto.randomUUID();
  const attemptId = crypto.randomUUID();
  const amountMinor = args.amountMinor ?? 1000;

  await db.insert(orders).values({
    id: orderId,
    totalAmountMinor: amountMinor,
    totalAmount: toDbMoney(amountMinor),
    currency: 'UAH',
    paymentProvider: 'monobank',
    paymentStatus: 'pending',
    status: 'INVENTORY_RESERVED',
    inventoryStatus: 'reserved',
    idempotencyKey: crypto.randomUUID(),
    createdAt: args.updatedAt,
    updatedAt: args.updatedAt,
  } as any);

  await db.insert(paymentAttempts).values({
    id: attemptId,
    orderId,
    provider: 'monobank',
    status: args.attemptStatus ?? 'active',
    attemptNumber: 1,
    currency: 'UAH',
    expectedAmountMinor: amountMinor,
    idempotencyKey: buildMonobankAttemptIdempotencyKey(orderId, 1),
    providerPaymentIntentId: args.invoiceId,
    createdAt: args.updatedAt,
    updatedAt: args.updatedAt,
  } as any);

  return { orderId, attemptId };
}

async function cleanup(orderId: string, invoiceId: string) {
  await db
    .delete(monobankEvents)
    .where(
      or(
        eq(monobankEvents.orderId, orderId),
        eq(monobankEvents.invoiceId, invoiceId)
      )
    );
  await db.delete(paymentAttempts).where(eq(paymentAttempts.orderId, orderId));
  await db.delete(orders).where(eq(orders.id, orderId));
}

function makeArgs(
  override?: Partial<Parameters<typeof runMonobankJanitorJob1>[0]>
) {
  return {
    dryRun: false,
    limit: 20,
    requestId: `req-${crypto.randomUUID()}`,
    runId: crypto.randomUUID(),
    baseMeta: {
      route: '/api/shop/internal/monobank/janitor',
      method: 'POST',
      jobName: 'monobank-janitor',
    },
    ...override,
  };
}

describe.sequential('monobank janitor job1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('MONO_JANITOR_JOB1_GRACE_SECONDS', '900');
    vi.stubEnv('MONO_JANITOR_LEASE_SECONDS', '120');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('stale active attempt + PSP success => paid order and succeeded attempt', async () => {
    const invoiceId = `inv_${crypto.randomUUID()}`;
    const staleAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const { orderId, attemptId } = await insertOrderAndAttempt({
      invoiceId,
      updatedAt: staleAt,
    });

    getInvoiceStatusMock.mockResolvedValueOnce({
      invoiceId,
      status: 'success',
      raw: {
        invoiceId,
        status: 'success',
        amount: 1000,
        ccy: 980,
        modifiedDate: 1700000000000,
      },
    });

    try {
      const res = await runMonobankJanitorJob1(makeArgs());
      expect(res).toEqual({
        processed: 1,
        applied: 1,
        noop: 0,
        failed: 0,
      });

      const [order] = await db
        .select({
          paymentStatus: orders.paymentStatus,
          status: orders.status,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      expect(order?.paymentStatus).toBe('paid');
      expect(order?.status).toBe('PAID');

      const [attempt] = await db
        .select({
          status: paymentAttempts.status,
          janitorClaimedUntil: paymentAttempts.janitorClaimedUntil,
          janitorClaimedBy: paymentAttempts.janitorClaimedBy,
        })
        .from(paymentAttempts)
        .where(eq(paymentAttempts.id, attemptId))
        .limit(1);
      expect(attempt?.status).toBe('succeeded');
      expect(attempt?.janitorClaimedUntil).toBeNull();
      expect(attempt?.janitorClaimedBy).toBeNull();
    } finally {
      await cleanup(orderId, invoiceId);
    }
  });

  it('stale active attempt + PSP expired => failed attempt and restocked order', async () => {
    const invoiceId = `inv_${crypto.randomUUID()}`;
    const staleAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const { orderId, attemptId } = await insertOrderAndAttempt({
      invoiceId,
      updatedAt: staleAt,
    });

    getInvoiceStatusMock.mockResolvedValueOnce({
      invoiceId,
      status: 'expired',
      raw: {
        invoiceId,
        status: 'expired',
        amount: 1000,
        ccy: 980,
        modifiedDate: 1700000000001,
      },
    });

    try {
      const res = await runMonobankJanitorJob1(makeArgs());
      expect(res).toEqual({
        processed: 1,
        applied: 1,
        noop: 0,
        failed: 0,
      });

      const [order] = await db
        .select({
          paymentStatus: orders.paymentStatus,
          status: orders.status,
          inventoryStatus: orders.inventoryStatus,
          stockRestored: orders.stockRestored,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      expect(order?.paymentStatus).toBe('failed');
      expect(order?.stockRestored).toBe(true);
      expect(order?.inventoryStatus).toBe('released');
      expect(order?.status).toBe('INVENTORY_FAILED');

      const [attempt] = await db
        .select({
          status: paymentAttempts.status,
          janitorClaimedUntil: paymentAttempts.janitorClaimedUntil,
          janitorClaimedBy: paymentAttempts.janitorClaimedBy,
        })
        .from(paymentAttempts)
        .where(eq(paymentAttempts.id, attemptId))
        .limit(1);
      expect(attempt?.status).toBe('failed');
      expect(attempt?.janitorClaimedUntil).toBeNull();
      expect(attempt?.janitorClaimedBy).toBeNull();
    } finally {
      await cleanup(orderId, invoiceId);
    }
  });

  it('rerun is idempotent: second run is noop and does not re-apply transitions', async () => {
    vi.stubEnv('MONO_JANITOR_JOB1_GRACE_SECONDS', '1');

    const invoiceId = `inv_${crypto.randomUUID()}`;

    const veryOld = new Date(Date.now() - 20 * 365 * 24 * 60 * 60 * 1000); 
    const { orderId, attemptId } = await insertOrderAndAttempt({
      invoiceId,
      updatedAt: veryOld,
    });

    const rawPayload = {
      invoiceId,
      status: 'processing',
      amount: 1000,
      ccy: 980,
      modifiedDate: 1700000000002,
    };

    getInvoiceStatusMock.mockResolvedValue({
      invoiceId,
      status: 'processing',
      raw: rawPayload,
    });

    try {
      const first = await runMonobankJanitorJob1(makeArgs());
      expect(first).toEqual({ processed: 1, applied: 0, noop: 1, failed: 0 });

      await db
        .update(paymentAttempts)
        .set({ updatedAt: veryOld })
        .where(eq(paymentAttempts.id, attemptId));

      const second = await runMonobankJanitorJob1(makeArgs());
      expect(second).toEqual({ processed: 1, applied: 0, noop: 1, failed: 0 });

      expect(getInvoiceStatusMock).toHaveBeenCalledTimes(2);

    } finally {
      await cleanup(orderId, invoiceId);
    }
  }, 15000);
});
