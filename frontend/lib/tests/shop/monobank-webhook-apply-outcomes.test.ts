import crypto from 'node:crypto';

import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';

function readRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const anyRes = res as any;
  if (Array.isArray(anyRes?.rows)) return anyRes.rows as T[];
  return [];
}

const enumLabelCache = new Map<string, string[]>();

async function getEnumLabelsByColumn(
  tableName: string,
  columnName: string
): Promise<string[]> {
  const cacheKey = `${tableName}.${columnName}`;
  const cached = enumLabelCache.get(cacheKey);
  if (cached) return cached;

  const typeRes = await db.execute(sql`
    select udt_name as type_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = ${tableName}
      and column_name = ${columnName}
    limit 1
  `);
  const typeRow = readRows<{ type_name?: string }>(typeRes)[0];
  const typeName = typeRow?.type_name;
  if (!typeName) throw new Error(`Cannot resolve enum type for ${cacheKey}`);

  const labelsRes = await db.execute(sql`
    select e.enumlabel as label
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typname = ${typeName}
    order by e.enumsortorder
  `);
  const labels = readRows<{ label?: string }>(labelsRes)
    .map(r => r.label)
    .filter((x): x is string => typeof x === 'string' && x.length > 0);

  if (labels.length === 0) {
    throw new Error(`Enum ${typeName} has no labels (for ${cacheKey})`);
  }

  enumLabelCache.set(cacheKey, labels);
  return labels;
}

async function pickEnumLabelByColumn(
  tableName: string,
  columnName: string,
  preferred?: string[]
): Promise<string> {
  const labels = await getEnumLabelsByColumn(tableName, columnName);
  if (preferred?.length) {
    const found = preferred.find(p => labels.includes(p));
    if (found) return found;
  }
  return labels[0]!;
}

vi.mock('@/lib/services/orders/payment-state', () => {
  return {
    guardedPaymentStatusUpdate: vi.fn(),
  };
});

vi.mock('@/lib/logging', () => {
  return {
    logInfo: vi.fn(),
    logError: vi.fn(),
    logWarn: vi.fn(),
  };
});

import { logError } from '@/lib/logging';
import { applyMonoWebhookEvent } from '@/lib/services/orders/monobank-webhook';
import { guardedPaymentStatusUpdate } from '@/lib/services/orders/payment-state';

function sha256Hex(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function uuid(): string {
  return crypto.randomUUID();
}

async function insertOrder(args: {
  orderId: string;
  currency: 'UAH' | 'USD';
  totalAmountMinor: number;
  paymentProvider: 'monobank' | 'stripe';
  paymentStatus: string;
  status?: string;
}) {
  const idemKey = `test_${args.orderId}`;
  const statusLabel =
    args.status ??
    (await pickEnumLabelByColumn('orders', 'status', [
      'RESERVING',
      'CREATED',
      'NEW',
      'PENDING',
    ]));
  await db.execute(sql`
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
      psp_metadata,
      created_at,
      updated_at
    )
    values (
      ${args.orderId}::uuid,
      null,
        ${idemKey},
      ${args.currency},
      (${args.totalAmountMinor}::numeric / 100),
      ${args.totalAmountMinor},
      ${args.paymentProvider},
      ${args.paymentStatus},
      ${statusLabel},
      '{}'::jsonb,
      now(),
      now()
    )
  `);
}

async function insertAttempt(args: {
  attemptId: string;
  orderId: string;
  status?: string;
  expectedAmountMinor: number;
  invoiceId: string;
  providerModifiedAt: Date | null;
}) {
  const attemptStatus =
    args.status ??
    (await pickEnumLabelByColumn('payment_attempts', 'status', [
      'pending',
      'created',
      'requires_action',
    ]));

  const attemptNumberRes = await db.execute(sql`
    select coalesce(max(attempt_number), 0)::int + 1 as n
    from payment_attempts
    where order_id = ${args.orderId}::uuid
  `);
  const attemptNumber = readRows<{ n?: number }>(attemptNumberRes)[0]?.n ?? 1;
  const idempotencyKey = `test:${args.attemptId}`;
  await db.execute(sql`
    insert into payment_attempts (
      id,
      order_id,
      provider,
      attempt_number,
      status,
      idempotency_key,
      expected_amount_minor,
      provider_payment_intent_id,
      provider_modified_at,
      created_at,
      updated_at
    )
    values (
      ${args.attemptId}::uuid,
      ${args.orderId}::uuid,
      'monobank',
      ${attemptNumber},
      ${attemptStatus},
        ${idempotencyKey},
      ${args.expectedAmountMinor},
      ${args.invoiceId},
      ${args.providerModifiedAt ?? null},
      now(),
      now()
    )
  `);
}

async function fetchEventByRawSha256(rawSha256: string) {
  const res = (await db.execute(sql`
    select
      id,
      invoice_id,
      status,
      applied_result,
      applied_error_code,
      applied_error_message,
      attempt_id,
      order_id,
      raw_sha256
    from monobank_events
    where raw_sha256 = ${rawSha256}
    limit 1
  `)) as unknown as { rows?: any[] };

  return res.rows?.[0] ?? null;
}

async function cleanup(args: {
  orderId: string;
  attemptId: string;
  rawSha256: string;
}) {
  await db.execute(
    sql`delete from monobank_events where raw_sha256 = ${args.rawSha256}`
  );
  await db.execute(
    sql`delete from payment_attempts where id = ${args.attemptId}::uuid`
  );
  await db.execute(sql`delete from orders where id = ${args.orderId}::uuid`);
}

describe('monobank-webhook apply outcomes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('P1#2: amount mismatch -> persistEventOutcome uses applied_with_issue even when transition is blocked', async () => {
    (
      guardedPaymentStatusUpdate as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      applied: false,
      currentProvider: 'monobank',
      from: 'pending',
      reason: 'blocked_for_test',
    });

    const orderId = uuid();
    const attemptId = uuid();
    const invoiceId = 'inv_' + uuid().replace(/-/g, '').slice(0, 24);

    await insertOrder({
      orderId,
      currency: 'UAH',
      totalAmountMinor: 100,
      paymentProvider: 'monobank',
      paymentStatus: 'pending',
    });

    await insertAttempt({
      attemptId,
      orderId,
      status: 'pending',
      expectedAmountMinor: 100,
      invoiceId,
      providerModifiedAt: null,
    });

    const payload = {
      invoiceId,
      status: 'success',
      amount: 101,
      ccy: 980,
      reference: attemptId,
    };

    const rawBody = JSON.stringify(payload);
    const rawSha256 = sha256Hex(Buffer.from(rawBody, 'utf8'));

    try {
      const res = await applyMonoWebhookEvent({
        rawBody,
        parsedPayload: payload as any,
        requestId: 'test_amount_mismatch',
        mode: 'apply',
        rawSha256,
        eventKey: rawSha256,
      });

      expect(res.appliedResult).toBe('applied_with_issue');

      const ev = await fetchEventByRawSha256(rawSha256);
      expect(ev).not.toBeNull();
      expect(ev.applied_result).toBe('applied_with_issue');
      expect(ev.applied_error_code).toBe('AMOUNT_MISMATCH');
      expect(ev.attempt_id).toBe(attemptId);
      expect(ev.order_id).toBe(orderId);
    } finally {
      await cleanup({ orderId, attemptId, rawSha256 });
    }
  });

  it('P1#2: provider_modified_at out-of-order -> applied_noop + OUT_OF_ORDER', async () => {
    const orderId = uuid();
    const attemptId = uuid();
    const invoiceId = 'inv_' + uuid().replace(/-/g, '').slice(0, 24);

    const attemptModifiedAt = new Date();
    const payloadModifiedAt = new Date(attemptModifiedAt.getTime() - 60_000);

    await insertOrder({
      orderId,
      currency: 'UAH',
      totalAmountMinor: 100,
      paymentProvider: 'monobank',
      paymentStatus: 'pending',
    });

    await insertAttempt({
      attemptId,
      orderId,
      status: 'pending',
      expectedAmountMinor: 100,
      invoiceId,
      providerModifiedAt: attemptModifiedAt,
    });

    const payload = {
      invoiceId,
      status: 'success',
      amount: 100,
      ccy: 980,
      reference: attemptId,
      modifiedAt: payloadModifiedAt.toISOString(),
    };

    const rawBody = JSON.stringify(payload);
    const rawSha256 = sha256Hex(Buffer.from(rawBody, 'utf8'));

    try {
      const res = await applyMonoWebhookEvent({
        rawBody,
        parsedPayload: payload as any,
        requestId: 'test_out_of_order',
        mode: 'apply',
        rawSha256,
        eventKey: rawSha256,
      });

      expect(res.appliedResult).toBe('applied_noop');

      const ev = await fetchEventByRawSha256(rawSha256);
      expect(ev).not.toBeNull();
      expect(ev.applied_result).toBe('applied_noop');
      expect(ev.applied_error_code).toBe('OUT_OF_ORDER');
      expect(ev.attempt_id).toBe(attemptId);
      expect(ev.order_id).toBe(orderId);
    } finally {
      await cleanup({ orderId, attemptId, rawSha256 });
    }
  });

  it('P1#3: unknown status -> applied_noop + UNKNOWN_STATUS + operational log', async () => {
    const orderId = uuid();
    const attemptId = uuid();
    const invoiceId = 'inv_' + uuid().replace(/-/g, '').slice(0, 24);

    await insertOrder({
      orderId,
      currency: 'UAH',
      totalAmountMinor: 100,
      paymentProvider: 'monobank',
      paymentStatus: 'pending',
    });

    await insertAttempt({
      attemptId,
      orderId,
      status: 'pending',
      expectedAmountMinor: 100,
      invoiceId,
      providerModifiedAt: null,
    });

    const payload = {
      invoiceId,
      status: 'totally_new_status',
      amount: 100,
      ccy: 980,
      reference: attemptId,
    };

    const rawBody = JSON.stringify(payload);
    const rawSha256 = sha256Hex(Buffer.from(rawBody, 'utf8'));

    try {
      const res = await applyMonoWebhookEvent({
        rawBody,
        parsedPayload: payload as any,
        requestId: 'test_unknown_status',
        mode: 'apply',
        rawSha256,
        eventKey: rawSha256,
      });

      expect(res.appliedResult).toBe('applied_noop');

      const ev = await fetchEventByRawSha256(rawSha256);
      expect(ev).not.toBeNull();
      expect(ev.applied_result).toBe('applied_noop');
      expect(ev.applied_error_code).toBe('UNKNOWN_STATUS');

      expect(logError).toHaveBeenCalled();
      const calls = (logError as any).mock.calls as any[][];
      const found = calls.find(c => c?.[0] === 'MONO_WEBHOOK_UNKNOWN_STATUS');
      expect(found).toBeTruthy();

      const meta = found?.[2];
      expect(meta?.eventId).toBeTruthy();
      expect(meta?.status).toBe('totally_new_status');
      expect(meta?.invoiceId).toBe(invoiceId);
      expect(meta?.orderId).toBe(orderId);
      expect(meta?.attemptId).toBe(attemptId);
    } finally {
      await cleanup({ orderId, attemptId, rawSha256 });
    }
  });
});
