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
import { assertNotProductionDb } from '@/lib/tests/helpers/db-safety';

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
      applied_at,
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

async function fetchOrderAttemptState(args: {
  orderId: string;
  attemptId: string;
}) {
  const orderRes = await db.execute(sql`
    select
      id,
      payment_status,
      payment_provider
    from orders
    where id = ${args.orderId}::uuid
    limit 1
  `);
  const attemptRes = await db.execute(sql`
    select
      id,
      status,
      last_error_code,
      provider_modified_at,
      finalized_at
    from payment_attempts
    where id = ${args.attemptId}::uuid
    limit 1
  `);

  return {
    order: readRows<any>(orderRes)[0] ?? null,
    attempt: readRows<any>(attemptRes)[0] ?? null,
  };
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
  assertNotProductionDb();

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

  it('paid-is-sticky out-of-order: success first, then older processing keeps order paid', async () => {
    (
      guardedPaymentStatusUpdate as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      applied: false,
      currentProvider: 'monobank',
      from: 'paid',
      reason: 'already_in_state',
    });

    const orderId = uuid();
    const attemptId = uuid();
    const invoiceId = 'inv_' + uuid().replace(/-/g, '').slice(0, 24);
    const now = Date.now();

    await insertOrder({
      orderId,
      currency: 'UAH',
      totalAmountMinor: 100,
      paymentProvider: 'monobank',
      paymentStatus: 'paid',
    });
    await insertAttempt({
      attemptId,
      orderId,
      status: 'succeeded',
      expectedAmountMinor: 100,
      invoiceId,
      providerModifiedAt: new Date(now),
    });

    const successPayload = {
      invoiceId,
      status: 'success',
      amount: 100,
      ccy: 980,
      reference: attemptId,
      modifiedAt: new Date(now).toISOString(),
    };
    const processingPayload = {
      invoiceId,
      status: 'processing',
      amount: 100,
      ccy: 980,
      reference: attemptId,
      modifiedAt: new Date(now - 60_000).toISOString(),
    };

    const successRaw = JSON.stringify(successPayload);
    const processingRaw = JSON.stringify(processingPayload);
    const successRawSha256 = sha256Hex(Buffer.from(successRaw, 'utf8'));
    const processingRawSha256 = sha256Hex(Buffer.from(processingRaw, 'utf8'));

    try {
      const first = await applyMonoWebhookEvent({
        rawBody: successRaw,
        parsedPayload: successPayload as any,
        requestId: 'test_paid_sticky_success_first',
        mode: 'apply',
        rawSha256: successRawSha256,
        eventKey: successRawSha256,
      });
      expect(first.appliedResult).toBe('applied_noop');

      const second = await applyMonoWebhookEvent({
        rawBody: processingRaw,
        parsedPayload: processingPayload as any,
        requestId: 'test_paid_sticky_older_processing',
        mode: 'apply',
        rawSha256: processingRawSha256,
        eventKey: processingRawSha256,
      });

      expect(second.appliedResult).toBe('applied_noop');

      const state = await fetchOrderAttemptState({ orderId, attemptId });
      expect(state.order?.payment_status).toBe('paid');
      expect(state.attempt?.status).toBe('succeeded');

      const secondEvent = await fetchEventByRawSha256(processingRawSha256);
      expect(secondEvent?.applied_result).toBe('applied_noop');
      expect(secondEvent?.applied_error_code).toBe('OUT_OF_ORDER');
    } finally {
      await db.execute(
        sql`delete from monobank_events where raw_sha256 in (${successRawSha256}, ${processingRawSha256})`
      );
      await db.execute(
        sql`delete from payment_attempts where id = ${attemptId}::uuid`
      );
      await db.execute(sql`delete from orders where id = ${orderId}::uuid`);
    }
  });

  it('dedupe: second processing of the same event is no-op and does not rewrite applied timestamp', async () => {
    (
      guardedPaymentStatusUpdate as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      applied: true,
      currentProvider: 'monobank',
      from: 'pending',
      reason: null,
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
      amount: 100,
      ccy: 980,
      reference: attemptId,
    };
    const rawBody = JSON.stringify(payload);
    const rawSha256 = sha256Hex(Buffer.from(rawBody, 'utf8'));

    try {
      const first = await applyMonoWebhookEvent({
        rawBody,
        parsedPayload: payload as any,
        requestId: 'test_dedupe_first',
        mode: 'apply',
        rawSha256,
        eventKey: rawSha256,
      });
      expect(first.appliedResult).toBe('applied');
      expect(first.deduped).toBe(false);

      const beforeEvent = await fetchEventByRawSha256(rawSha256);
      const beforeState = await fetchOrderAttemptState({ orderId, attemptId });

      const second = await applyMonoWebhookEvent({
        rawBody,
        parsedPayload: payload as any,
        requestId: 'test_dedupe_second',
        mode: 'apply',
        rawSha256,
        eventKey: rawSha256,
      });

      expect(second.appliedResult).toBe('deduped');
      expect(second.deduped).toBe(true);

      const afterEvent = await fetchEventByRawSha256(rawSha256);
      const afterState = await fetchOrderAttemptState({ orderId, attemptId });

      expect(afterEvent?.id).toBe(beforeEvent?.id);
      expect(afterEvent?.applied_result).toBe(beforeEvent?.applied_result);
      expect(String(afterEvent?.applied_at ?? '')).toBe(
        String(beforeEvent?.applied_at ?? '')
      );
      expect(afterState).toEqual(beforeState);
    } finally {
      await cleanup({ orderId, attemptId, rawSha256 });
    }
  });

  it('mismatch must NOT set paid: applied_with_issue and attempt failure markers are persisted', async () => {
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
        requestId: 'test_mismatch_not_paid',
        mode: 'apply',
        rawSha256,
        eventKey: rawSha256,
      });

      expect(res.appliedResult).toBe('applied_with_issue');

      const state = await fetchOrderAttemptState({ orderId, attemptId });
      expect(state.order?.payment_status).not.toBe('paid');
      expect(state.order?.payment_status).toBe('pending');
      expect(state.attempt?.status).toBe('failed');
      expect(state.attempt?.last_error_code).toBe('AMOUNT_MISMATCH');

      const ev = await fetchEventByRawSha256(rawSha256);
      expect(ev?.applied_result).toBe('applied_with_issue');
      expect(ev?.applied_error_code).toBe('AMOUNT_MISMATCH');
    } finally {
      await cleanup({ orderId, attemptId, rawSha256 });
    }
  });
});
