import 'server-only';

import { and, desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { monobankPaymentCancels, orders, paymentAttempts } from '@/db/schema';
import { getMonobankEnv } from '@/lib/env/monobank';
import { logError, logInfo, logWarn } from '@/lib/logging';
import { PspError, removeInvoice } from '@/lib/psp/monobank';

import {
  InvalidPayloadError,
  OrderNotFoundError,
  PspUnavailableError,
} from '../errors';
import { restockOrder } from './restock';
import { getOrderById } from './summary';

type CancelStatus = 'requested' | 'processing' | 'success' | 'failure';
type CancelRow = typeof monobankPaymentCancels.$inferSelect;
const REQUESTED_POLL_ATTEMPTS = 5;
const REQUESTED_POLL_DELAY_MS = 75;

type OrderCancelRow = {
  id: string;
  paymentProvider: string;
  paymentStatus: string;
  status: string;
  inventoryStatus: string;
  stockRestored: boolean;
  pspChargeId: string | null;
};

function invalid(code: string, message: string): InvalidPayloadError {
  return new InvalidPayloadError(message, { code });
}

function toTrimmedOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function makeCancelExtRef(orderId: string): string {
  return `mono_cancel:${orderId}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isPaidLike(order: Pick<OrderCancelRow, 'paymentStatus' | 'status'>): boolean {
  return (
    order.paymentStatus === 'paid' ||
    order.paymentStatus === 'refunded' ||
    order.status === 'PAID'
  );
}

function isFinalCanceled(order: Pick<OrderCancelRow, 'status' | 'inventoryStatus' | 'stockRestored'>): boolean {
  return (
    order.status === 'CANCELED' &&
    order.inventoryStatus === 'released' &&
    order.stockRestored
  );
}

async function loadOrderForCancel(orderId: string): Promise<OrderCancelRow> {
  const [row] = await db
    .select({
      id: orders.id,
      paymentProvider: orders.paymentProvider,
      paymentStatus: orders.paymentStatus,
      status: orders.status,
      inventoryStatus: orders.inventoryStatus,
      stockRestored: orders.stockRestored,
      pspChargeId: orders.pspChargeId,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!row) throw new OrderNotFoundError('Order not found.');
  return row;
}

function readInvoiceFromAttempt(row: {
  providerPaymentIntentId: string | null;
  metadata: unknown;
}): string | null {
  const direct = toTrimmedOrNull(row.providerPaymentIntentId);
  if (direct) return direct;

  if (!row.metadata || typeof row.metadata !== 'object' || Array.isArray(row.metadata)) {
    return null;
  }

  return toTrimmedOrNull((row.metadata as Record<string, unknown>).invoiceId);
}

async function findInvoiceAttempt(
  orderId: string,
  statuses: string[]
): Promise<{ attemptId: string | null; invoiceId: string | null }> {
  const [attempt] = await db
    .select({
      id: paymentAttempts.id,
      providerPaymentIntentId: paymentAttempts.providerPaymentIntentId,
      metadata: paymentAttempts.metadata,
    })
    .from(paymentAttempts)
    .where(
      and(
        eq(paymentAttempts.orderId, orderId),
        eq(paymentAttempts.provider, 'monobank'),
        inArray(paymentAttempts.status, statuses)
      )
    )
    .orderBy(
      desc(paymentAttempts.updatedAt),
      desc(paymentAttempts.createdAt),
      desc(paymentAttempts.attemptNumber),
      desc(paymentAttempts.id)
    )
    .limit(1);

  if (!attempt) return { attemptId: null, invoiceId: null };

  return {
    attemptId: attempt.id,
    invoiceId: readInvoiceFromAttempt(attempt),
  };
}

async function resolveInvoiceForCancel(orderId: string, pspChargeId: string | null) {
  const direct = toTrimmedOrNull(pspChargeId);
  if (direct) return { invoiceId: direct, attemptId: null as string | null };

  const succeeded = await findInvoiceAttempt(orderId, ['succeeded']);
  if (succeeded.invoiceId) return succeeded;

  const active = await findInvoiceAttempt(orderId, ['active', 'creating']);
  if (active.invoiceId) return active;

  return {
    invoiceId: null,
    attemptId: succeeded.attemptId ?? active.attemptId,
  };
}

async function getCancelByExtRef(extRef: string): Promise<CancelRow | null> {
  const rows = await db
    .select()
    .from(monobankPaymentCancels)
    .where(eq(monobankPaymentCancels.extRef, extRef))
    .limit(1);

  return rows[0] ?? null;
}

async function pollRequestedCancelStatus(
  extRef: string
): Promise<CancelRow | null> {
  let row = await getCancelByExtRef(extRef);

  for (
    let attempt = 0;
    attempt < REQUESTED_POLL_ATTEMPTS && row?.status === 'requested';
    attempt++
  ) {
    await sleep(REQUESTED_POLL_DELAY_MS);
    row = await getCancelByExtRef(extRef);
  }

  return row;
}

async function insertRequestedCancel(args: {
  orderId: string;
  extRef: string;
  invoiceId: string;
  attemptId: string | null;
  requestId: string;
}): Promise<CancelRow | null> {
  const rows = await db
    .insert(monobankPaymentCancels)
    .values({
      orderId: args.orderId,
      extRef: args.extRef,
      invoiceId: args.invoiceId,
      attemptId: args.attemptId,
      status: 'requested',
      requestId: args.requestId,
    })
    .onConflictDoNothing({ target: monobankPaymentCancels.extRef })
    .returning();

  return rows[0] ?? null;
}

async function updateCancelStatus(args: {
  cancelId: string;
  status: CancelStatus;
  requestId: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  pspResponse?: Record<string, unknown> | null;
}): Promise<CancelRow | null> {
  const rows = await db
    .update(monobankPaymentCancels)
    .set({
      status: args.status,
      requestId: args.requestId,
      errorCode: args.errorCode ?? null,
      errorMessage: args.errorMessage ?? null,
      pspResponse: args.pspResponse ?? null,
      updatedAt: new Date(),
    })
    .where(eq(monobankPaymentCancels.id, args.cancelId))
    .returning();

  return rows[0] ?? null;
}

async function retryFailedCancel(args: {
  extRef: string;
  requestId: string;
}): Promise<CancelRow | null> {
  const rows = await db
    .update(monobankPaymentCancels)
    .set({
      status: 'requested',
      requestId: args.requestId,
      errorCode: null,
      errorMessage: null,
      pspResponse: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(monobankPaymentCancels.extRef, args.extRef),
        eq(monobankPaymentCancels.status, 'failure')
      )
    )
    .returning();

  return rows[0] ?? null;
}

async function finalizeProcessingCancel(args: {
  cancelRow: CancelRow;
  orderId: string;
  requestId: string;
}): Promise<{
  order: Awaited<ReturnType<typeof getOrderById>>;
  cancel: { id: string | null; extRef: string; status: string; deduped: boolean };
}> {
  try {
    await restockOrder(args.orderId, {
      reason: 'canceled',
      workerId: 'admin-cancel-payment',
    });
  } catch (error) {
    logError('monobank_cancel_payment_finalize_failed', error, {
      code: 'CANCEL_FINALIZE_FAILED',
      orderId: args.orderId,
      cancelId: args.cancelRow.id,
      extRef: args.cancelRow.extRef,
      requestId: args.requestId,
    });

    throw error;
  }

  const updated = await db
    .update(monobankPaymentCancels)
    .set({
      status: 'success',
      requestId: args.requestId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(monobankPaymentCancels.id, args.cancelRow.id),
        eq(monobankPaymentCancels.status, 'processing')
      )
    )
    .returning();

  const row = updated[0] ?? (await getCancelByExtRef(args.cancelRow.extRef));

  return {
    order: await getOrderById(args.orderId),
    cancel: {
      id: row?.id ?? args.cancelRow.id,
      extRef: args.cancelRow.extRef,
      status: row?.status ?? 'success',
      deduped: true,
    },
  };
}

export async function cancelMonobankUnpaidPayment(args: {
  orderId: string;
  requestId: string;
}): Promise<{
  order: Awaited<ReturnType<typeof getOrderById>>;
  cancel: {
    id: string | null;
    extRef: string;
    status: string;
    deduped: boolean;
  };
}> {
  const env = getMonobankEnv();
  if (!env.token || !env.paymentsEnabled) {
    throw invalid('CANCEL_DISABLED', 'Cancel payments are disabled.');
  }

  const order = await loadOrderForCancel(args.orderId);

  if (order.paymentProvider !== 'monobank') {
    throw invalid(
      'CANCEL_PROVIDER_NOT_MONOBANK',
      'Cancel payment is supported only for Monobank orders.'
    );
  }

  if (isPaidLike(order)) {
    throw invalid('CANCEL_NOT_ALLOWED', 'Order is already paid/refunded.');
  }

  const extRef = makeCancelExtRef(args.orderId);

  if (isFinalCanceled(order)) {
    const existing = await getCancelByExtRef(extRef);
    return {
      order: await getOrderById(args.orderId),
      cancel: {
        id: existing?.id ?? null,
        extRef,
        status: 'success',
        deduped: true,
      },
    };
  }

  const resolved = await resolveInvoiceForCancel(args.orderId, order.pspChargeId);
  if (!resolved.invoiceId) {
    throw invalid(
      'CANCEL_MISSING_PROVIDER_REF',
      'Missing Monobank invoice identifier for cancel.'
    );
  }

  let cancelRow = await insertRequestedCancel({
    orderId: args.orderId,
    extRef,
    invoiceId: resolved.invoiceId,
    attemptId: resolved.attemptId,
    requestId: args.requestId,
  });

  let isLeader = !!cancelRow;

  if (!cancelRow) {
    const current = await getCancelByExtRef(extRef);
    if (!current) {
      throw new PspUnavailableError('Cancel idempotency state unavailable.', {
        orderId: args.orderId,
        requestId: args.requestId,
      });
    }

    if (current.status === 'success') {
      return {
        order: await getOrderById(args.orderId),
        cancel: {
          id: current.id,
          extRef,
          status: 'success',
          deduped: true,
        },
      };
    }

    if (current.status === 'processing') {
      return finalizeProcessingCancel({
        cancelRow: current,
        orderId: args.orderId,
        requestId: args.requestId,
      });
    }

    if (current.status === 'requested') {
      const settled = await pollRequestedCancelStatus(extRef);
      if (!settled || settled.status === 'requested') {
        throw invalid(
          'CANCEL_IN_PROGRESS',
          'Cancel payment is already in progress. Retry shortly.'
        );
      }

      if (settled.status === 'success') {
        return {
          order: await getOrderById(args.orderId),
          cancel: {
            id: settled.id,
            extRef,
            status: 'success',
            deduped: true,
          },
        };
      }

      if (settled.status === 'processing') {
        return finalizeProcessingCancel({
          cancelRow: settled,
          orderId: args.orderId,
          requestId: args.requestId,
        });
      }

      return {
        order: await getOrderById(args.orderId),
        cancel: {
          id: settled.id,
          extRef,
          status: settled.status,
          deduped: true,
        },
      };
    }

    const retried = await retryFailedCancel({
      extRef,
      requestId: args.requestId,
    });

    if (retried) {
      cancelRow = retried;
      isLeader = true;
    } else {
      const afterRetry = await getCancelByExtRef(extRef);
      if (!afterRetry) {
        throw new PspUnavailableError('Cancel state missing after retry.', {
          orderId: args.orderId,
          requestId: args.requestId,
        });
      }

      if (afterRetry.status === 'processing') {
        return finalizeProcessingCancel({
          cancelRow: afterRetry,
          orderId: args.orderId,
          requestId: args.requestId,
        });
      }

      return {
        order: await getOrderById(args.orderId),
        cancel: {
          id: afterRetry.id,
          extRef,
          status: afterRetry.status,
          deduped: true,
        },
      };
    }
  }

  if (!isLeader || !cancelRow) {
    throw new PspUnavailableError('Cancel leader election failed.', {
      orderId: args.orderId,
      requestId: args.requestId,
    });
  }

  let pspResponse: Record<string, unknown> | null = null;

  try {
    const result = await removeInvoice(cancelRow.invoiceId);
    pspResponse =
      result && typeof result === 'object' && !Array.isArray(result)
        ? (result as Record<string, unknown>)
        : null;
  } catch (error) {
    const errorCode = error instanceof PspError ? error.code : 'PSP_UNAVAILABLE';
    const errorMessage = error instanceof Error ? error.message : 'PSP unavailable';

    await updateCancelStatus({
      cancelId: cancelRow.id,
      status: 'failure',
      requestId: args.requestId,
      errorCode,
      errorMessage,
      pspResponse: null,
    });

    logWarn('monobank_cancel_payment_psp_unavailable', {
      code: 'PSP_UNAVAILABLE',
      orderId: args.orderId,
      cancelId: cancelRow.id,
      extRef,
      requestId: args.requestId,
      pspCode: errorCode,
    });

    throw new PspUnavailableError('Payment provider unavailable.', {
      orderId: args.orderId,
      requestId: args.requestId,
    });
  }

  cancelRow =
    (await updateCancelStatus({
      cancelId: cancelRow.id,
      status: 'processing',
      requestId: args.requestId,
      errorCode: null,
      errorMessage: null,
      pspResponse,
    })) ?? cancelRow;

  try {
    await restockOrder(args.orderId, {
      reason: 'canceled',
      workerId: 'admin-cancel-payment',
    });
  } catch (error) {
    logError('monobank_cancel_payment_finalize_failed', error, {
      code: 'CANCEL_FINALIZE_FAILED',
      orderId: args.orderId,
      cancelId: cancelRow.id,
      extRef,
      requestId: args.requestId,
    });

    throw error;
  }

  const successRow =
    (await updateCancelStatus({
      cancelId: cancelRow.id,
      status: 'success',
      requestId: args.requestId,
      errorCode: null,
      errorMessage: null,
      pspResponse,
    })) ?? cancelRow;

  logInfo('monobank_cancel_payment_succeeded', {
    code: 'CANCEL_PAYMENT_SUCCEEDED',
    orderId: args.orderId,
    cancelId: successRow.id,
    extRef,
    requestId: args.requestId,
  });

  return {
    order: await getOrderById(args.orderId),
    cancel: {
      id: successRow.id,
      extRef,
      status: successRow.status,
      deduped: false,
    },
  };
}
