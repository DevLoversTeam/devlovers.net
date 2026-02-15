import 'server-only';

import { and, desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { monobankRefunds, orders, paymentAttempts } from '@/db/schema';
import { getMonobankConfig } from '@/lib/env/monobank';
import { logWarn } from '@/lib/logging';
import {
  MONO_DEDUP,
  MONO_REFUND_APPLIED,
  monoLogInfo,
  monoLogWarn,
} from '@/lib/logging/monobank';
import { cancelInvoicePayment, PspError } from '@/lib/psp/monobank';

import {
  InvalidPayloadError,
  OrderNotFoundError,
  PspUnavailableError,
} from '../errors';
import { getOrderById } from './summary';

type MonobankRefundRow = typeof monobankRefunds.$inferSelect;
type RefundStatus = MonobankRefundRow['status'];

function invalid(
  code: string,
  message: string,
  details?: Record<string, unknown>
): InvalidPayloadError {
  return new InvalidPayloadError(message, { code, details });
}

function toTrimmedOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function makeMonobankRefundExtRef(orderId: string): string {
  return `mono_refund:${orderId}:full`;
}

function isDedupedRefundStatus(status: RefundStatus): boolean {
  return status === 'processing' || status === 'success';
}

function isRetryableRefundStatus(status: RefundStatus): boolean {
  return status === 'requested' || status === 'failure';
}

function mapRefundRow(row: MonobankRefundRow) {
  return {
    id: row.id,
    extRef: row.extRef,
    status: row.status,
    amountMinor: row.amountMinor,
    currency: row.currency,
  };
}

async function getExistingRefund(
  extRef: string
): Promise<MonobankRefundRow | null> {
  const rows = await db
    .select()
    .from(monobankRefunds)
    .where(eq(monobankRefunds.extRef, extRef))
    .limit(1);
  return rows[0] ?? null;
}

function readAttemptInvoiceId(row: {
  providerPaymentIntentId: string | null;
  metadata: unknown;
}): string | null {
  const direct = toTrimmedOrNull(row.providerPaymentIntentId);
  if (direct) return direct;

  if (
    !row.metadata ||
    typeof row.metadata !== 'object' ||
    Array.isArray(row.metadata)
  ) {
    return null;
  }

  return toTrimmedOrNull((row.metadata as Record<string, unknown>).invoiceId);
}

async function findInvoiceAttempt(
  orderId: string,
  statuses: string[]
): Promise<{ invoiceId: string | null; attemptId: string | null } | null> {
  const [attemptRow] = await db
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

  if (!attemptRow) return null;

  return {
    invoiceId: readAttemptInvoiceId(attemptRow),
    attemptId: attemptRow.id,
  };
}

async function getMonobankInvoiceId(orderId: string): Promise<{
  invoiceId: string | null;
  attemptId: string | null;
}> {
  const [orderRow] = await db
    .select({
      pspChargeId: orders.pspChargeId,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  const fromOrder = toTrimmedOrNull(orderRow?.pspChargeId);
  if (fromOrder) {
    return { invoiceId: fromOrder, attemptId: null };
  }

  const succeeded = await findInvoiceAttempt(orderId, ['succeeded']);
  if (succeeded?.invoiceId) return succeeded;

  const active = await findInvoiceAttempt(orderId, ['active', 'creating']);
  if (active?.invoiceId) return active;

  return {
    invoiceId: null,
    attemptId: succeeded?.attemptId ?? active?.attemptId ?? null,
  };
}

async function reconcileSuccessFromOrder(args: {
  refund: MonobankRefundRow;
  orderId: string;
}): Promise<MonobankRefundRow> {
  if (args.refund.status === 'success') return args.refund;

  const [orderRow] = await db
    .select({ paymentStatus: orders.paymentStatus })
    .from(orders)
    .where(eq(orders.id, args.orderId))
    .limit(1);

  if (!orderRow || orderRow.paymentStatus !== 'refunded') {
    return args.refund;
  }

  const now = new Date();
  const updated = await db
    .update(monobankRefunds)
    .set({
      status: 'success',
      providerModifiedAt: now,
      updatedAt: now,
    })
    .where(eq(monobankRefunds.id, args.refund.id))
    .returning();

  return updated[0] ?? args.refund;
}

export async function requestMonobankFullRefund(args: {
  orderId: string;
  requestId: string;
}): Promise<{
  order: Awaited<ReturnType<typeof getOrderById>>;
  refund: {
    id: string;
    extRef: string;
    status: string;
    amountMinor: number;
    currency: string;
  };
  deduped: boolean;
}> {
  const { refundEnabled } = getMonobankConfig();
  if (!refundEnabled) {
    throw invalid('REFUND_DISABLED', 'Refunds are disabled.');
  }

  const [orderRow] = await db
    .select({
      id: orders.id,
      paymentProvider: orders.paymentProvider,
      paymentStatus: orders.paymentStatus,
      currency: orders.currency,
      totalAmountMinor: orders.totalAmountMinor,
    })
    .from(orders)
    .where(eq(orders.id, args.orderId))
    .limit(1);

  if (!orderRow) throw new OrderNotFoundError('Order not found.');

  if (orderRow.paymentProvider !== 'monobank') {
    throw invalid(
      'REFUND_PROVIDER_NOT_MONOBANK',
      'Refund is supported only for Monobank orders'
    );
  }

  const amountMinor = orderRow.totalAmountMinor;
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw invalid('REFUND_ORDER_MONEY_INVALID', 'Invalid order amount');
  }

  if (orderRow.currency !== 'UAH') {
    throw invalid(
      'REFUND_ORDER_CURRENCY_INVALID',
      'Monobank refund requires UAH order currency'
    );
  }

  const extRef = makeMonobankRefundExtRef(args.orderId);
  const existing = await getExistingRefund(extRef);
  let refundRowForPsp: MonobankRefundRow | null = null;
  let deduped = false;

  if (existing) {
    const reconciled = await reconcileSuccessFromOrder({
      refund: existing,
      orderId: args.orderId,
    });

    if (isDedupedRefundStatus(reconciled.status)) {
      monoLogInfo(MONO_REFUND_APPLIED, {
        requestId: args.requestId,
        orderId: args.orderId,
        attemptId: reconciled.attemptId,
        status: reconciled.status,
        deduped: true,
        reason: 'existing_refund',
      });
      return {
        order: await getOrderById(args.orderId),
        refund: mapRefundRow(reconciled),
        deduped: true,
      };
    }

    if (!isRetryableRefundStatus(reconciled.status)) {
      monoLogInfo(MONO_REFUND_APPLIED, {
        requestId: args.requestId,
        orderId: args.orderId,
        attemptId: reconciled.attemptId,
        status: reconciled.status,
        deduped: true,
        reason: 'existing_terminal_refund',
      });
      return {
        order: await getOrderById(args.orderId),
        refund: mapRefundRow(reconciled),
        deduped: true,
      };
    }

    if (orderRow.paymentStatus !== 'paid') {
      throw invalid(
        'REFUND_ORDER_NOT_PAID',
        'Order is not refundable in current state'
      );
    }

    const now = new Date();
    const retried = await db
      .update(monobankRefunds)
      .set({
        status: 'requested',
        providerModifiedAt: now,
        updatedAt: now,
      })
      .where(eq(monobankRefunds.id, reconciled.id))
      .returning();

    refundRowForPsp = retried[0] ?? reconciled;
    deduped = false;
  }

  if (!refundRowForPsp && orderRow.paymentStatus !== 'paid') {
    throw invalid(
      'REFUND_ORDER_NOT_PAID',
      'Order is not refundable in current state'
    );
  }

  const { invoiceId, attemptId } = await getMonobankInvoiceId(args.orderId);
  if (!invoiceId) {
    throw invalid(
      'REFUND_MISSING_PROVIDER_REF',
      'Missing Monobank invoice identifier for refund'
    );
  }

  if (!refundRowForPsp) {
    const now = new Date();
    const inserted = await db
      .insert(monobankRefunds)
      .values({
        provider: 'monobank',
        orderId: args.orderId,
        attemptId,
        extRef,
        status: 'requested',
        amountMinor,
        currency: 'UAH',
        providerCreatedAt: now,
        providerModifiedAt: now,
      })
      .onConflictDoNothing({ target: monobankRefunds.extRef })
      .returning();

    if (!inserted[0]) {
      const conflict = await getExistingRefund(extRef);
      if (!conflict) {
        monoLogWarn(MONO_DEDUP, {
          orderId: args.orderId,
          requestId: args.requestId,
          reason: 'refund_insert_conflict_without_existing_row',
        });
        throw invalid('REFUND_CONFLICT', 'Refund idempotency conflict.', {
          orderId: args.orderId,
          requestId: args.requestId,
          extRef,
        });
      }

      const reconciled = await reconcileSuccessFromOrder({
        refund: conflict,
        orderId: args.orderId,
      });

      if (isDedupedRefundStatus(reconciled.status)) {
        monoLogInfo(MONO_REFUND_APPLIED, {
          requestId: args.requestId,
          orderId: args.orderId,
          attemptId: reconciled.attemptId,
          status: reconciled.status,
          deduped: true,
          reason: 'conflict_existing_refund',
        });
        return {
          order: await getOrderById(args.orderId),
          refund: mapRefundRow(reconciled),
          deduped: true,
        };
      }

      if (!isRetryableRefundStatus(reconciled.status)) {
        monoLogInfo(MONO_REFUND_APPLIED, {
          requestId: args.requestId,
          orderId: args.orderId,
          attemptId: reconciled.attemptId,
          status: reconciled.status,
          deduped: true,
          reason: 'conflict_existing_terminal_refund',
        });
        return {
          order: await getOrderById(args.orderId),
          refund: mapRefundRow(reconciled),
          deduped: true,
        };
      }

      if (orderRow.paymentStatus !== 'paid') {
        throw invalid(
          'REFUND_ORDER_NOT_PAID',
          'Order is not refundable in current state'
        );
      }

      const now = new Date();
      const retried = await db
        .update(monobankRefunds)
        .set({
          status: 'requested',
          providerModifiedAt: now,
          updatedAt: now,
        })
        .where(eq(monobankRefunds.id, reconciled.id))
        .returning();

      refundRowForPsp = retried[0] ?? reconciled;
      deduped = false;
    } else {
      refundRowForPsp = inserted[0];
      deduped = false;
    }
  }

  if (!refundRowForPsp) {
    throw new PspUnavailableError('Refund row not initialized.', {
      orderId: args.orderId,
      requestId: args.requestId,
    });
  }

  try {
    await cancelInvoicePayment({
      invoiceId,
      extRef,
      amountMinor,
    });
  } catch (error) {
    const now = new Date();
    await db
      .update(monobankRefunds)
      .set({
        status: 'failure',
        providerModifiedAt: now,
        updatedAt: now,
      })
      .where(eq(monobankRefunds.id, refundRowForPsp.id));

    logWarn('monobank_refund_psp_unavailable', {
      orderId: args.orderId,
      attemptId,
      code: error instanceof PspError ? error.code : 'PSP_UNAVAILABLE',
      requestId: args.requestId,
    });

    throw new PspUnavailableError('Monobank refund unavailable.', {
      orderId: args.orderId,
      requestId: args.requestId,
    });
  }

  const now = new Date();
  const [processing] = await db
    .update(monobankRefunds)
    .set({
      status: 'processing',
      providerModifiedAt: now,
      updatedAt: now,
    })
    .where(eq(monobankRefunds.id, refundRowForPsp.id))
    .returning();

  monoLogInfo(MONO_REFUND_APPLIED, {
    requestId: args.requestId,
    orderId: args.orderId,
    attemptId,
    invoiceId,
    status: (processing ?? refundRowForPsp).status,
    deduped,
    reason: 'refund_requested',
  });

  return {
    order: await getOrderById(args.orderId),
    refund: mapRefundRow(processing ?? refundRowForPsp),
    deduped,
  };
}
