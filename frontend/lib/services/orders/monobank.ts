import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { orders, paymentAttempts } from '@/db/schema';
import {
  createMonobankInvoice,
  cancelMonobankInvoice,
  MONO_CURRENCY,
} from '@/lib/psp/monobank';
import { logError, logWarn } from '@/lib/logging';

import { restockOrder } from '@/lib/services/orders/restock';
import {
  InvalidPayloadError,
  OrderNotFoundError,
  OrderStateInvalidError,
  PspInvoicePersistError,
  PspUnavailableError,
} from '@/lib/services/errors';

type PaymentAttemptRow = typeof paymentAttempts.$inferSelect;

const DEFAULT_MAX_ATTEMPTS = 2;
const CREATING_STALE_MS = 2 * 60 * 1000;

function readPageUrlFromMetadata(attempt: PaymentAttemptRow): string | null {
  const meta = attempt.metadata as Record<string, unknown> | null;
  const raw = meta?.pageUrl;
  if (typeof raw === 'string' && raw.trim().length > 0) return raw.trim();
  return null;
}

async function getActiveAttempt(
  orderId: string
): Promise<PaymentAttemptRow | null> {
  const rows = await db
    .select()
    .from(paymentAttempts)
    .where(
      and(
        eq(paymentAttempts.orderId, orderId),
        eq(paymentAttempts.provider, 'monobank'),
        sql`${paymentAttempts.status} in ('creating','active')`
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

async function getMaxAttemptNumber(orderId: string): Promise<number> {
  const rows = await db
    .select({
      max: sql<number>`coalesce(max(${paymentAttempts.attemptNumber}), 0)`,
    })
    .from(paymentAttempts)
    .where(
      and(
        eq(paymentAttempts.orderId, orderId),
        eq(paymentAttempts.provider, 'monobank')
      )
    );

  return rows[0]?.max ?? 0;
}

async function createCreatingAttempt(args: {
  orderId: string;
  expectedAmountMinor: number;
  maxAttempts: number;
}): Promise<PaymentAttemptRow> {
  const next = (await getMaxAttemptNumber(args.orderId)) + 1;
  if (next > args.maxAttempts) {
    throw new InvalidPayloadError('Payment attempts exhausted.', {
      code: 'PAYMENT_ATTEMPTS_EXHAUSTED',
    });
  }

  const idempotencyKey = `mono:${args.orderId}:${next}`;
  const inserted = await db
    .insert(paymentAttempts)
    .values({
      orderId: args.orderId,
      provider: 'monobank',
      status: 'creating',
      attemptNumber: next,
      idempotencyKey,
      currency: MONO_CURRENCY,
      expectedAmountMinor: args.expectedAmountMinor,
      metadata: {},
    })
    .returning();

  const row = inserted[0];
  if (!row) throw new Error('Failed to insert payment_attempts row');
  return row;
}

async function readMonobankInvoiceParams(orderId: string): Promise<{
  amountMinor: number;
  currency: string;
}> {
  const [existing] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!existing) throw new OrderNotFoundError('Order not found');

  if (existing.paymentProvider !== 'monobank') {
    throw new InvalidPayloadError('Order is not a Monobank payment.');
  }

  const allowed = ['pending', 'requires_payment'];
  if (!allowed.includes(existing.paymentStatus)) {
    throw new OrderStateInvalidError(
      'Order is not payable; Monobank invoice creation is not allowed in the current state.',
      {
        orderId,
        field: 'paymentStatus',
        rawValue: existing.paymentStatus,
        details: { allowed, paymentProvider: existing.paymentProvider },
      }
    );
  }

  if (existing.currency !== MONO_CURRENCY) {
    throw new OrderStateInvalidError('Order currency is not UAH.', {
      orderId,
      field: 'currency',
      rawValue: existing.currency,
    });
  }

  const amountMinor = existing.totalAmountMinor;
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new OrderStateInvalidError(
      'Invalid order total for Monobank invoice creation.',
      { orderId, field: 'totalAmountMinor', rawValue: amountMinor }
    );
  }

  return { amountMinor, currency: existing.currency };
}

async function markAttemptFailed(args: {
  attemptId: string;
  errorCode: string;
  errorMessage: string;
  meta?: Record<string, unknown>;
}) {
  await db
    .update(paymentAttempts)
    .set({
      status: 'failed',
      finalizedAt: new Date(),
      updatedAt: new Date(),
      lastErrorCode: args.errorCode,
      lastErrorMessage: args.errorMessage,
      metadata: { ...(args.meta ?? {}) },
    })
    .where(eq(paymentAttempts.id, args.attemptId));
}

async function cancelOrderAndRelease(orderId: string, reason: string) {
  const now = new Date();
  await db
    .update(orders)
    .set({
      status: 'CANCELED',
      failureCode: 'PSP_UNAVAILABLE',
      failureMessage: reason,
      updatedAt: now,
    })
    .where(eq(orders.id, orderId));

  await restockOrder(orderId, { reason: 'canceled', workerId: 'monobank' });
}

export async function createMonobankAttemptAndInvoice(args: {
  orderId: string;
  baseUrl: string;
  statusToken: string;
  requestId: string;
  maxAttempts?: number;
}): Promise<{
  invoiceId: string;
  pageUrl: string;
  attemptId: string;
  attemptNumber: number;
}> {
  const snapshot = await readMonobankInvoiceParams(args.orderId);

  const existing = await getActiveAttempt(args.orderId);
  if (existing) {
    const pageUrl = readPageUrlFromMetadata(existing);
    if (existing.providerPaymentIntentId && pageUrl) {
      return {
        invoiceId: existing.providerPaymentIntentId,
        pageUrl,
        attemptId: existing.id,
        attemptNumber: existing.attemptNumber,
      };
    }

    const ageMs =
      Date.now() - new Date(existing.updatedAt ?? existing.createdAt).getTime();
    if (existing.status === 'creating' && ageMs < CREATING_STALE_MS) {
      throw new InvalidPayloadError(
        'Payment initialization already in progress. Retry shortly.',
        { code: 'CHECKOUT_CONFLICT' }
      );
    }

    await markAttemptFailed({
      attemptId: existing.id,
      errorCode: 'invoice_missing',
      errorMessage: 'Active attempt missing invoice details.',
    });
    await cancelOrderAndRelease(args.orderId, 'Invoice creation incomplete.');
    throw new PspUnavailableError('Invoice creation incomplete.', {
      orderId: args.orderId,
      requestId: args.requestId,
    });
  }

  const attempt = await createCreatingAttempt({
    orderId: args.orderId,
    expectedAmountMinor: snapshot.amountMinor,
    maxAttempts: args.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
  });

  const base = args.baseUrl.replace(/\/$/, '');
  const redirectUrl = `${base}/shop/checkout/success?orderId=${encodeURIComponent(
    args.orderId
  )}&statusToken=${encodeURIComponent(args.statusToken)}`;
  const webhookUrl = `${base}/api/shop/webhooks/monobank`;

  let invoice: { invoiceId: string; pageUrl: string };
  try {
    const created = await createMonobankInvoice({
      amountMinor: snapshot.amountMinor,
      orderId: args.orderId,
      redirectUrl,
      webhookUrl,
      paymentType: 'debit',
    });
    invoice = { invoiceId: created.invoiceId, pageUrl: created.pageUrl };
  } catch (error) {
    logWarn('monobank_invoice_create_failed', {
      orderId: args.orderId,
      attemptId: attempt.id,
      code: 'PSP_UNAVAILABLE',
      requestId: args.requestId,
      message: error instanceof Error ? error.message : String(error),
    });

    await markAttemptFailed({
      attemptId: attempt.id,
      errorCode: 'invoice_create_failed',
      errorMessage:
        error instanceof Error ? error.message : 'Invoice create failed',
      meta: { requestId: args.requestId },
    });

    await cancelOrderAndRelease(
      args.orderId,
      'Monobank invoice create failed.'
    );

    throw new PspUnavailableError('Monobank invoice unavailable.', {
      orderId: args.orderId,
      requestId: args.requestId,
    });
  }

  try {
    await db.transaction(async tx => {
      await tx
        .update(paymentAttempts)
        .set({
          status: 'active',
          providerPaymentIntentId: invoice.invoiceId,
          metadata: { pageUrl: invoice.pageUrl },
          updatedAt: new Date(),
        })
        .where(eq(paymentAttempts.id, attempt.id));

      const [order] = await tx
        .select({ pspMetadata: orders.pspMetadata })
        .from(orders)
        .where(eq(orders.id, args.orderId))
        .limit(1);

      const merged = {
        ...(order?.pspMetadata ?? {}),
        monobank: {
          invoiceId: invoice.invoiceId,
          pageUrl: invoice.pageUrl,
        },
      };

      await tx
        .update(orders)
        .set({
          pspChargeId: invoice.invoiceId,
          pspMetadata: merged,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, args.orderId));
    });
  } catch (error) {
    logError('monobank_invoice_persist_failed', error, {
      orderId: args.orderId,
      attemptId: attempt.id,
      invoiceId: invoice.invoiceId,
      requestId: args.requestId,
    });

    await cancelMonobankInvoice(invoice.invoiceId);
    await cancelOrderAndRelease(args.orderId, 'Invoice persistence failed.');

    throw new PspInvoicePersistError('Invoice persistence failed.', {
      orderId: args.orderId,
    });
  }

  return {
    invoiceId: invoice.invoiceId,
    pageUrl: invoice.pageUrl,
    attemptId: attempt.id,
    attemptNumber: attempt.attemptNumber,
  };
}
