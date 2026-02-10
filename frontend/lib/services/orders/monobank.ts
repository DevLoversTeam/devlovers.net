import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { orderItems, orders, paymentAttempts } from '@/db/schema';
import { logError, logWarn } from '@/lib/logging';
import {
  cancelMonobankInvoice,
  createMonobankInvoice,
  MONO_CURRENCY,
  type MonobankInvoiceCreateArgs,
} from '@/lib/psp/monobank';
import {
  buildMonoMerchantPaymInfoFromSnapshot,
  MonobankMerchantPaymInfoError,
} from '@/lib/psp/monobank/merchant-paym-info';
import {
  InvalidPayloadError,
  OrderNotFoundError,
  OrderStateInvalidError,
  PspInvoicePersistError,
  PspUnavailableError,
} from '@/lib/services/errors';
import { restockOrder } from '@/lib/services/orders/restock';
import { toAbsoluteUrl } from '@/lib/shop/url';

import { buildMonobankAttemptIdempotencyKey } from './attempt-idempotency';

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

  const idempotencyKey = buildMonobankAttemptIdempotencyKey(args.orderId, next);
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

function isUniqueViolation(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    (error as { code?: unknown }).code === '23505'
  );
}

async function readMonobankInvoiceParams(orderId: string): Promise<{
  amountMinor: number;
  currency: string;
  items: Array<{
    productId: string;
    title: string | null;
    quantity: number;
    unitPriceMinor: number;
    lineTotalMinor: number;
  }>;
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

  const items = await db
    .select({
      productId: orderItems.productId,
      productTitle: orderItems.productTitle,
      productSlug: orderItems.productSlug,
      productSku: orderItems.productSku,
      quantity: orderItems.quantity,
      unitPriceMinor: orderItems.unitPriceMinor,
      lineTotalMinor: orderItems.lineTotalMinor,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  return {
    amountMinor,
    currency: existing.currency,
    items: items.map(item => ({
      productId: item.productId,
      title: item.productTitle ?? item.productSlug ?? item.productSku ?? null,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
      lineTotalMinor: item.lineTotalMinor,
    })),
  };
}

async function markAttemptFailed(args: {
  attemptId: string;
  errorCode: string;
  errorMessage: string;
  meta?: Record<string, unknown>;
}) {
  const now = new Date();
  const metaPatch = args.meta ?? {};
  await db
    .update(paymentAttempts)
    .set({
      status: 'failed',
      finalizedAt: now,
      updatedAt: now,
      lastErrorCode: args.errorCode,
      lastErrorMessage: args.errorMessage,
      metadata:
        sql`coalesce(${paymentAttempts.metadata}, '{}'::jsonb) || ${JSON.stringify(
          metaPatch
        )}::jsonb` as any,
    })
    .where(eq(paymentAttempts.id, args.attemptId));
}

async function cancelOrderAndRelease(orderId: string, reason: string) {
  const now = new Date();

  const updated = await db
    .update(orders)
    .set({
      status: 'CANCELED',
      failureCode: 'PSP_UNAVAILABLE',
      failureMessage: reason,
      updatedAt: now,
    })
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.paymentProvider, 'monobank'),
        sql`${orders.paymentStatus} in ('pending','requires_payment')`
      )
    )
    .returning({ id: orders.id });

  if (updated[0]?.id) {
    await restockOrder(orderId, { reason: 'canceled', workerId: 'monobank' });
    return;
  }

  logWarn('monobank_cancel_order_skipped', {
    orderId,
    reason,
  });
}

async function finalizeAttemptWithInvoice(args: {
  attemptId: string;
  orderId: string;
  invoiceId: string;
  pageUrl: string;
  requestId: string;
}) {
  const maxRetries = 2;
  let lastError: unknown = null;
  let fallbackError: unknown = null;

  const now = new Date();

  const asObj = (v: unknown): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    return v as Record<string, unknown>;
  };

  const mergeMonobankMeta = (
    base: Record<string, unknown>
  ): Record<string, unknown> => {
    const mono = asObj(base.monobank);
    return {
      ...base,
      monobank: {
        ...mono,
        invoiceId: args.invoiceId,
        pageUrl: args.pageUrl,
      },
    };
  };

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      const [attemptRow] = await db
        .select({ metadata: paymentAttempts.metadata })
        .from(paymentAttempts)
        .where(eq(paymentAttempts.id, args.attemptId))
        .limit(1);

      if (!attemptRow) {
        throw new Error('Payment attempt not found during invoice finalize');
      }

      const nextAttemptMeta = {
        ...asObj(attemptRow.metadata),
        pageUrl: args.pageUrl,
        invoiceId: args.invoiceId,
      };

      const updatedAttempt = await db
        .update(paymentAttempts)
        .set({
          providerPaymentIntentId: args.invoiceId,
          metadata: nextAttemptMeta,
          updatedAt: now,
        })
        .where(eq(paymentAttempts.id, args.attemptId))
        .returning({ id: paymentAttempts.id });

      if (!updatedAttempt[0]?.id) {
        throw new Error('Payment attempt not found during invoice finalize');
      }

      const [orderRow] = await db
        .select({ pspMetadata: orders.pspMetadata })
        .from(orders)
        .where(eq(orders.id, args.orderId))
        .limit(1);

      if (!orderRow) {
        throw new Error('Order not found during invoice finalize');
      }

      const nextOrderMeta = mergeMonobankMeta(asObj(orderRow.pspMetadata));

      const updatedOrder = await db
        .update(orders)
        .set({
          pspChargeId: args.invoiceId,
          pspMetadata: nextOrderMeta,
          updatedAt: now,
        })
        .where(eq(orders.id, args.orderId))
        .returning({ id: orders.id });

      if (!updatedOrder[0]?.id) {
        throw new Error('Order not found during invoice finalize');
      }

      return;
    } catch (error) {
      lastError = error;
    }
  }

  const lastMsg =
    lastError instanceof Error && lastError.message
      ? lastError.message
      : 'Invoice persistence failed.';
  try {
    const patch = {
      pageUrl: args.pageUrl,
      invoiceId: args.invoiceId,
    };

    const updatedAttempt = await db
      .update(paymentAttempts)
      .set({
        providerPaymentIntentId: args.invoiceId,
        metadata:
          sql`coalesce(${paymentAttempts.metadata}, '{}'::jsonb) || ${JSON.stringify(
            patch
          )}::jsonb` as any,
        updatedAt: now,
      })
      .where(eq(paymentAttempts.id, args.attemptId))
      .returning({ id: paymentAttempts.id });

    if (updatedAttempt[0]?.id) {
      logWarn('monobank_invoice_persist_partial_attempt_only', {
        orderId: args.orderId,
        attemptId: args.attemptId,
        invoiceId: args.invoiceId,
        requestId: args.requestId,
        issue: lastMsg,
      });
    }
  } catch (err) {
    fallbackError = err;
  }

  logError('monobank_invoice_persist_retry_exhausted', lastError, {
    orderId: args.orderId,
    attemptId: args.attemptId,
    invoiceId: args.invoiceId,
    requestId: args.requestId,
    fallbackError:
      fallbackError instanceof Error
        ? `${fallbackError.name}: ${fallbackError.message}`
        : fallbackError,
  });

  try {
    await markAttemptFailed({
      attemptId: args.attemptId,
      errorCode: 'PSP_INVOICE_PERSIST_FAILED',
      errorMessage: lastMsg,
      meta: {
        requestId: args.requestId,
        invoiceId: args.invoiceId,
        pageUrl: args.pageUrl,
        reason: 'persist_retry_exhausted',
      },
    });
  } catch (error) {
    logError('monobank_attempt_mark_failed', error, {
      orderId: args.orderId,
      attemptId: args.attemptId,
      invoiceId: args.invoiceId,
      requestId: args.requestId,
    });
  }

  try {
    await cancelMonobankInvoice(args.invoiceId);
  } catch (error) {
    logError('monobank_invoice_cancel_failed', error, {
      orderId: args.orderId,
      attemptId: args.attemptId,
      invoiceId: args.invoiceId,
      requestId: args.requestId,
    });
  }

  try {
    await cancelOrderAndRelease(args.orderId, 'Invoice persistence failed.');
  } catch (error) {
    logError('monobank_cancel_order_failed', error, {
      orderId: args.orderId,
      attemptId: args.attemptId,
      invoiceId: args.invoiceId,
      requestId: args.requestId,
    });
  }

  throw new PspInvoicePersistError('Invoice persistence failed.', {
    orderId: args.orderId,
  });
}

type CreateMonoAttemptAndInvoiceDeps = {
  readMonobankInvoiceParams: typeof readMonobankInvoiceParams;
  getActiveAttempt: typeof getActiveAttempt;
  createCreatingAttempt: typeof createCreatingAttempt;
  markAttemptFailed: typeof markAttemptFailed;
  cancelOrderAndRelease: typeof cancelOrderAndRelease;
  createMonobankInvoice: typeof createMonobankInvoice;
  finalizeAttemptWithInvoice: typeof finalizeAttemptWithInvoice;
};

async function createMonoAttemptAndInvoiceImpl(
  deps: CreateMonoAttemptAndInvoiceDeps,
  args: {
    orderId: string;
    requestId: string;
    redirectUrl: string;
    webhookUrl: string;
    maxAttempts?: number;
  }
): Promise<{
  attemptId: string;
  invoiceId: string;
  pageUrl: string;
  currency: 'UAH';
  totalAmountMinor: number;
}> {
  const snapshot = await deps.readMonobankInvoiceParams(args.orderId);

  let existing = await deps.getActiveAttempt(args.orderId);
  if (existing) {
    const pageUrl = readPageUrlFromMetadata(existing);
    if (existing.providerPaymentIntentId && pageUrl) {
      return {
        invoiceId: existing.providerPaymentIntentId,
        pageUrl,
        attemptId: existing.id,
        currency: MONO_CURRENCY,
        totalAmountMinor: snapshot.amountMinor,
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

    logWarn('monobank_attempt_stale_missing_invoice', {
      orderId: args.orderId,
      attemptId: existing.id,
      status: existing.status,
      ageMs,
      requestId: args.requestId,
    });

    try {
      await deps.markAttemptFailed({
        attemptId: existing.id,
        errorCode: 'invoice_missing',
        errorMessage: 'Active attempt missing invoice details (stale).',
        meta: { requestId: args.requestId, ageMs, status: existing.status },
      });
    } catch (markError) {
      logError('monobank_attempt_mark_failed', markError, {
        orderId: args.orderId,
        attemptId: existing.id,
        requestId: args.requestId,
      });
      throw new PspUnavailableError('Attempt cleanup failed.', {
        orderId: args.orderId,
        requestId: args.requestId,
      });
    }

    existing = null;
  }

  let attempt: PaymentAttemptRow;
  try {
    attempt = await deps.createCreatingAttempt({
      orderId: args.orderId,
      expectedAmountMinor: snapshot.amountMinor,
      maxAttempts: args.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const reused = await deps.getActiveAttempt(args.orderId);
      if (reused) {
        const pageUrl = readPageUrlFromMetadata(reused);
        if (reused.providerPaymentIntentId && pageUrl) {
          return {
            invoiceId: reused.providerPaymentIntentId,
            pageUrl,
            attemptId: reused.id,
            currency: MONO_CURRENCY,
            totalAmountMinor: snapshot.amountMinor,
          };
        }
      }
    }
    throw error;
  }

  let merchantPaymInfo: MonobankInvoiceCreateArgs['merchantPaymInfo'];
  try {
    merchantPaymInfo = buildMonoMerchantPaymInfoFromSnapshot({
      reference: attempt.id,
      order: {
        id: args.orderId,
        currency: snapshot.currency,
        totalAmountMinor: snapshot.amountMinor,
      },
      items: snapshot.items,
      expectedAmountMinor: snapshot.amountMinor,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Invalid order snapshot';
    const errorCode =
      error instanceof MonobankMerchantPaymInfoError && error.code
        ? error.code
        : 'MONO_INVALID_SNAPSHOT';

    try {
      await deps.markAttemptFailed({
        attemptId: attempt.id,
        errorCode,
        errorMessage,
        meta: { requestId: args.requestId },
      });
    } catch (markError) {
      logError('monobank_attempt_mark_failed', markError, {
        orderId: args.orderId,
        attemptId: attempt.id,
        requestId: args.requestId,
      });
    }

    await deps.cancelOrderAndRelease(
      args.orderId,
      'Monobank snapshot validation failed.'
    );

    throw error;
  }

  let invoice: { invoiceId: string; pageUrl: string };
  try {
    const created = await deps.createMonobankInvoice({
      amountMinor: snapshot.amountMinor,
      orderId: args.orderId,
      redirectUrl: args.redirectUrl,
      webhookUrl: args.webhookUrl,
      paymentType: 'debit',
      merchantPaymInfo,
    });
    invoice = { invoiceId: created.invoiceId, pageUrl: created.pageUrl };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Invoice create failed';
    const errorCode =
      typeof (error as { code?: unknown }).code === 'string'
        ? String((error as { code?: unknown }).code)
        : 'PSP_UNAVAILABLE';

    logWarn('monobank_invoice_create_failed', {
      orderId: args.orderId,
      attemptId: attempt.id,
      code: errorCode,
      requestId: args.requestId,
      message: errorMessage,
    });

    try {
      await deps.markAttemptFailed({
        attemptId: attempt.id,
        errorCode,
        errorMessage,
        meta: { requestId: args.requestId },
      });
    } catch (markError) {
      logError('monobank_attempt_mark_failed', markError, {
        orderId: args.orderId,
        attemptId: attempt.id,
        requestId: args.requestId,
      });
    }

    let cancelError: unknown = null;

    try {
      await deps.cancelOrderAndRelease(
        args.orderId,
        'Monobank invoice create failed.'
      );
    } catch (err) {
      cancelError = err;

      logError('monobank_cancel_order_failed', err, {
        orderId: args.orderId,
        attemptId: attempt.id,
        requestId: args.requestId,
      });
    }

    throw new PspUnavailableError('Monobank invoice unavailable.', {
      orderId: args.orderId,
      requestId: args.requestId,

      attemptId: attempt.id,

      cause:
        cancelError instanceof Error
          ? `${cancelError.name}: ${cancelError.message}`
          : cancelError
            ? String(cancelError)
            : undefined,
    } as any);
  }

  await deps.finalizeAttemptWithInvoice({
    attemptId: attempt.id,
    orderId: args.orderId,
    invoiceId: invoice.invoiceId,
    pageUrl: invoice.pageUrl,
    requestId: args.requestId,
  });

  return {
    invoiceId: invoice.invoiceId,
    pageUrl: invoice.pageUrl,
    attemptId: attempt.id,
    currency: MONO_CURRENCY,
    totalAmountMinor: snapshot.amountMinor,
  };
}

export async function createMonoAttemptAndInvoice(args: {
  orderId: string;
  requestId: string;
  redirectUrl: string;
  webhookUrl: string;
  maxAttempts?: number;
}): Promise<{
  attemptId: string;
  invoiceId: string;
  pageUrl: string;
  currency: 'UAH';
  totalAmountMinor: number;
}> {
  return createMonoAttemptAndInvoiceImpl(
    {
      readMonobankInvoiceParams,
      getActiveAttempt,
      createCreatingAttempt,
      markAttemptFailed,
      cancelOrderAndRelease,
      createMonobankInvoice,
      finalizeAttemptWithInvoice,
    },
    args
  );
}

export const __test__ = {
  createMonoAttemptAndInvoiceImpl,
  finalizeAttemptWithInvoice,
};

export async function createMonobankAttemptAndInvoice(args: {
  orderId: string;
  statusToken: string;
  requestId: string;
  maxAttempts?: number;
}): Promise<{
  invoiceId: string;
  pageUrl: string;
  attemptId: string;
  attemptNumber: number;
  currency: 'UAH';
  totalAmountMinor: number;
}> {
  const redirectUrl = toAbsoluteUrl(
    `/shop/checkout/success?orderId=${encodeURIComponent(
      args.orderId
    )}&statusToken=${encodeURIComponent(args.statusToken)}`
  );
  const webhookUrl = toAbsoluteUrl('/api/shop/webhooks/monobank');

  const result = await createMonoAttemptAndInvoice({
    orderId: args.orderId,
    requestId: args.requestId,
    redirectUrl,
    webhookUrl,
    maxAttempts: args.maxAttempts,
  });

  const [row] = await db
    .select({ attemptNumber: paymentAttempts.attemptNumber })
    .from(paymentAttempts)
    .where(eq(paymentAttempts.id, result.attemptId))
    .limit(1);

  return {
    ...result,
    attemptNumber: row?.attemptNumber ?? 1,
  };
}
