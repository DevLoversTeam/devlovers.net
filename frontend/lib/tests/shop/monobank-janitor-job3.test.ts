import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import { monobankEvents, orders, paymentAttempts } from '@/db/schema';
import { resetEnvCache } from '@/lib/env';
import { buildMonobankAttemptIdempotencyKey } from '@/lib/services/orders/attempt-idempotency';
import { runMonobankJanitorJob3 } from '@/lib/services/orders/monobank-janitor';
import { toDbMoney } from '@/lib/shop/money';

vi.mock('@/lib/logging', async () => {
  const actual = await vi.importActual<any>('@/lib/logging');
  return {
    ...actual,
    logInfo: () => {},
    logWarn: () => {},
    logError: () => {},
  };
});

function sha256HexUtf8(value: string): string {
  return crypto
    .createHash('sha256')
    .update(Buffer.from(value, 'utf8'))
    .digest('hex');
}

async function insertOrderAndAttempt(args: {
  invoiceId: string;
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
    status: 'active',
    attemptNumber: 1,
    currency: 'UAH',
    expectedAmountMinor: amountMinor,
    idempotencyKey: buildMonobankAttemptIdempotencyKey(orderId, 1),
    providerPaymentIntentId: args.invoiceId,
    createdAt: args.updatedAt,
    updatedAt: args.updatedAt,
  } as any);

  return { orderId, attemptId, amountMinor };
}

async function insertStoredEvent(args: {
  orderId: string;
  attemptId: string;
  invoiceId: string;
  status: string;
  amountMinor: number;
  providerModifiedAt: Date | null;
  receivedAt: Date;
}) {
  const payload: Record<string, unknown> = {
    invoiceId: args.invoiceId,
    status: args.status,
    amount: args.amountMinor,
    ccy: 980,
    reference: args.attemptId,
    ...(args.providerModifiedAt
      ? { modifiedDate: args.providerModifiedAt.getTime() }
      : {}),
  };
  const rawBody = JSON.stringify(payload);
  const rawSha256 = sha256HexUtf8(rawBody);

  const inserted = await db
    .insert(monobankEvents)
    .values({
      eventKey: rawSha256,
      invoiceId: args.invoiceId,
      status: args.status,
      amount: args.amountMinor,
      ccy: 980,
      reference: args.attemptId,
      rawPayload: payload,
      normalizedPayload: payload,
      attemptId: args.attemptId,
      orderId: args.orderId,
      providerModifiedAt: args.providerModifiedAt,
      rawSha256,
      receivedAt: args.receivedAt,
      appliedAt: null,
      appliedResult: null,
      claimedAt: null,
      claimExpiresAt: null,
      claimedBy: null,
    })
    .returning({ id: monobankEvents.id });

  return inserted[0]!.id;
}

async function cleanup(orderId: string, attemptId: string) {
  await db.delete(monobankEvents).where(eq(monobankEvents.orderId, orderId));
  await db.delete(paymentAttempts).where(eq(paymentAttempts.id, attemptId));
  await db.delete(orders).where(eq(orders.id, orderId));
}

function makeArgs(
  override?: Partial<Parameters<typeof runMonobankJanitorJob3>[0]>
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

describe.sequential('monobank janitor job3', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APP_ORIGIN', 'http://localhost:3000');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');
    vi.stubEnv('SHOP_BASE_URL', 'http://localhost:3000');
    vi.stubEnv('MONO_WEBHOOK_MODE', 'store');
    vi.stubEnv('MONO_JANITOR_LEASE_SECONDS', '120');
    resetEnvCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCache();
  });

  it('backfill applies stored event once and rerun is noop', async () => {
    const invoiceId = `inv_${crypto.randomUUID()}`;
    const baseTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const { orderId, attemptId, amountMinor } = await insertOrderAndAttempt({
      invoiceId,
      updatedAt: baseTime,
    });

    await insertStoredEvent({
      orderId,
      attemptId,
      invoiceId,
      status: 'success',
      amountMinor,
      providerModifiedAt: new Date(baseTime.getTime() + 1_000),
      receivedAt: new Date(baseTime.getTime() + 2_000),
    });

    try {
      const first = await runMonobankJanitorJob3(makeArgs());
      expect(first).toEqual({
        processed: 1,
        applied: 1,
        noop: 0,
        failed: 0,
      });

      const [event] = await db
        .select({
          appliedAt: monobankEvents.appliedAt,
          appliedResult: monobankEvents.appliedResult,
          claimExpiresAt: monobankEvents.claimExpiresAt,
          claimedBy: monobankEvents.claimedBy,
        })
        .from(monobankEvents)
        .where(eq(monobankEvents.orderId, orderId))
        .limit(1);
      expect(event?.appliedAt).toBeTruthy();
      expect(['applied', 'applied_with_issue']).toContain(event?.appliedResult);
      expect(event?.claimExpiresAt).toBeNull();
      expect(event?.claimedBy).toBeNull();

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
        .select({ status: paymentAttempts.status })
        .from(paymentAttempts)
        .where(eq(paymentAttempts.id, attemptId))
        .limit(1);
      expect(attempt?.status).toBe('succeeded');

      const second = await runMonobankJanitorJob3(makeArgs());
      expect(second).toEqual({
        processed: 0,
        applied: 0,
        noop: 0,
        failed: 0,
      });
    } finally {
      await cleanup(orderId, attemptId);
    }
  });

  it('applies grouped events in provider_modified_at order and preserves invariants', async () => {
    const invoiceId = `inv_${crypto.randomUUID()}`;
    const baseTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const olderProviderModifiedAt = new Date(baseTime.getTime() + 1_000);
    const newerProviderModifiedAt = new Date(baseTime.getTime() + 30_000);
    const { orderId, attemptId, amountMinor } = await insertOrderAndAttempt({
      invoiceId,
      updatedAt: baseTime,
    });

    await insertStoredEvent({
      orderId,
      attemptId,
      invoiceId,
      status: 'success',
      amountMinor,
      providerModifiedAt: newerProviderModifiedAt,
      receivedAt: new Date(baseTime.getTime() + 5_000),
    });
    await insertStoredEvent({
      orderId,
      attemptId,
      invoiceId,
      status: 'processing',
      amountMinor,
      providerModifiedAt: olderProviderModifiedAt,
      receivedAt: new Date(baseTime.getTime() + 40_000),
    });

    try {
      const res = await runMonobankJanitorJob3(makeArgs());
      expect(res).toEqual({
        processed: 2,
        applied: 1,
        noop: 1,
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
        .select({ status: paymentAttempts.status })
        .from(paymentAttempts)
        .where(eq(paymentAttempts.id, attemptId))
        .limit(1);
      expect(attempt?.status).toBe('succeeded');

      const appliedEvents = await db
        .select({
          status: monobankEvents.status,
          appliedAt: monobankEvents.appliedAt,
          appliedResult: monobankEvents.appliedResult,
        })
        .from(monobankEvents)
        .where(eq(monobankEvents.orderId, orderId));

      const processing = appliedEvents.find(ev => ev.status === 'processing');
      const success = appliedEvents.find(ev => ev.status === 'success');
      expect(processing?.appliedAt).toBeTruthy();
      expect(success?.appliedAt).toBeTruthy();

      const processingAt = new Date(String(processing?.appliedAt)).getTime();
      const successAt = new Date(String(success?.appliedAt)).getTime();
      expect(processingAt).toBeLessThanOrEqual(successAt);
      expect(processing?.appliedResult).toBe('applied_noop');
      expect(success?.appliedResult).toBe('applied');
    } finally {
      await cleanup(orderId, attemptId);
    }
  });

  it('dryRun does not mutate stored events or order/attempt state', async () => {
    const invoiceId = `inv_${crypto.randomUUID()}`;
    const baseTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const { orderId, attemptId, amountMinor } = await insertOrderAndAttempt({
      invoiceId,
      updatedAt: baseTime,
    });

    const eventId = await insertStoredEvent({
      orderId,
      attemptId,
      invoiceId,
      status: 'success',
      amountMinor,
      providerModifiedAt: new Date(baseTime.getTime() + 1_000),
      receivedAt: new Date(baseTime.getTime() + 2_000),
    });

    try {
      const res = await runMonobankJanitorJob3(
        makeArgs({
          dryRun: true,
        })
      );
      expect(res).toEqual({
        processed: 1,
        applied: 0,
        noop: 0,
        failed: 0,
      });

      const [event] = await db
        .select({
          appliedAt: monobankEvents.appliedAt,
          appliedResult: monobankEvents.appliedResult,
          claimExpiresAt: monobankEvents.claimExpiresAt,
          claimedBy: monobankEvents.claimedBy,
        })
        .from(monobankEvents)
        .where(eq(monobankEvents.id, eventId))
        .limit(1);
      expect(event?.appliedAt).toBeNull();
      expect(event?.appliedResult).toBeNull();
      expect(event?.claimExpiresAt).toBeNull();
      expect(event?.claimedBy).toBeNull();

      const [order] = await db
        .select({
          paymentStatus: orders.paymentStatus,
          status: orders.status,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      expect(order?.paymentStatus).toBe('pending');
      expect(order?.status).toBe('INVENTORY_RESERVED');

      const [attempt] = await db
        .select({ status: paymentAttempts.status })
        .from(paymentAttempts)
        .where(eq(paymentAttempts.id, attemptId))
        .limit(1);
      expect(attempt?.status).toBe('active');
    } finally {
      await cleanup(orderId, attemptId);
    }
  });

  it('throws mode mismatch when webhook mode is not store', async () => {
    vi.stubEnv('MONO_WEBHOOK_MODE', 'apply');
    resetEnvCache();

    await expect(runMonobankJanitorJob3(makeArgs())).rejects.toMatchObject({
      code: 'MONO_WEBHOOK_MODE_NOT_STORE',
    });
  });
});
