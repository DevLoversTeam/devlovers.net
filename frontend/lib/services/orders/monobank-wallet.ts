import 'server-only';

import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/db';
import { orders, paymentAttempts } from '@/db/schema';
import {
  MONO_CCY,
  MONO_CURRENCY,
  type MonobankWalletPaymentResult,
  PspError,
  walletPayment,
} from '@/lib/psp/monobank';
import {
  IdempotencyConflictError,
  InvalidPayloadError,
  OrderNotFoundError,
  OrderStateInvalidError,
} from '@/lib/services/errors';

type PaymentAttemptRow = typeof paymentAttempts.$inferSelect;
type WalletOrderRow = Pick<
  typeof orders.$inferSelect,
  'id' | 'paymentProvider' | 'paymentStatus' | 'currency' | 'totalAmountMinor'
>;

const DEFAULT_MAX_ATTEMPTS = 2;
const ACTIVE_ATTEMPT_STATUSES = ['creating', 'active'] as const;

type MonobankWalletSubmitOutcome = 'submitted' | 'unknown';

export type MonobankWalletSubmitResult = {
  attemptId: string;
  attemptNumber: number;
  invoiceId: string | null;
  redirectUrl: string | null;
  outcome: MonobankWalletSubmitOutcome;
  syncStatus: string | null;
  providerModifiedAt: Date | null;
  reused: boolean;
};

export class MonobankWalletConflictError extends Error {
  readonly code = 'MONOBANK_WALLET_CONFLICT' as const;
  readonly orderId: string;
  readonly attemptId: string;
  readonly activeIdempotencyKey: string;
  readonly requestedIdempotencyKey: string;

  constructor(args: {
    orderId: string;
    attemptId: string;
    activeIdempotencyKey: string;
    requestedIdempotencyKey: string;
  }) {
    super(
      'Monobank wallet submit already in progress for this order with another idempotency key.'
    );
    this.name = 'MonobankWalletConflictError';
    this.orderId = args.orderId;
    this.attemptId = args.attemptId;
    this.activeIdempotencyKey = args.activeIdempotencyKey;
    this.requestedIdempotencyKey = args.requestedIdempotencyKey;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readWalletMetadata(meta: Record<string, unknown>): Record<string, unknown> {
  const monobank = asRecord(meta.monobank);
  const monobankWallet = asRecord(monobank.wallet);
  if (Object.keys(monobankWallet).length > 0) return monobankWallet;
  return asRecord(meta.wallet);
}

function parseIsoDateOrNull(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms);
}

function readReplayResult(
  attempt: PaymentAttemptRow,
  reused: boolean
): MonobankWalletSubmitResult {
  const meta = asRecord(attempt.metadata);
  const wallet = readWalletMetadata(meta);

  const submitOutcome =
    wallet.submitOutcome === 'unknown' ? 'unknown' : 'submitted';
  const syncStatus =
    typeof wallet.syncStatus === 'string' && wallet.syncStatus.trim()
      ? wallet.syncStatus.trim()
      : null;
  const invoiceId =
    typeof attempt.providerPaymentIntentId === 'string' &&
    attempt.providerPaymentIntentId.trim()
      ? attempt.providerPaymentIntentId.trim()
      : typeof wallet.invoiceId === 'string' && wallet.invoiceId.trim()
        ? wallet.invoiceId.trim()
        : null;
  const redirectUrl =
    typeof wallet.redirectUrl === 'string' && wallet.redirectUrl.trim()
      ? wallet.redirectUrl.trim()
      : null;
  const providerModifiedAt =
    attempt.providerModifiedAt ??
    parseIsoDateOrNull(wallet.providerModifiedAt ?? null);

  return {
    attemptId: attempt.id,
    attemptNumber: attempt.attemptNumber,
    invoiceId,
    redirectUrl,
    outcome: submitOutcome,
    syncStatus,
    providerModifiedAt,
    reused,
  };
}

function assertWalletOrderPayable(order: WalletOrderRow): void {
  if (order.paymentProvider !== 'monobank') {
    throw new OrderStateInvalidError(
      'Order is not a Monobank payment for wallet submit.',
      {
        orderId: order.id,
        field: 'paymentProvider',
        rawValue: order.paymentProvider,
      }
    );
  }

  if (!['pending', 'requires_payment'].includes(order.paymentStatus)) {
    throw new OrderStateInvalidError(
      'Order is not payable; Monobank wallet submit is not allowed in the current state.',
      {
        orderId: order.id,
        field: 'paymentStatus',
        rawValue: order.paymentStatus,
        details: { allowed: ['pending', 'requires_payment'] },
      }
    );
  }

  if (order.currency !== MONO_CURRENCY) {
    throw new OrderStateInvalidError('Order currency is not UAH.', {
      orderId: order.id,
      field: 'currency',
      rawValue: order.currency,
    });
  }

  if (
    !Number.isSafeInteger(order.totalAmountMinor) ||
    order.totalAmountMinor <= 0
  ) {
    throw new OrderStateInvalidError(
      'Invalid order total for Monobank wallet submit.',
      {
        orderId: order.id,
        field: 'totalAmountMinor',
        rawValue: order.totalAmountMinor,
      }
    );
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    (error as { code?: unknown }).code === '23505'
  );
}

async function readWalletOrder(orderId: string): Promise<WalletOrderRow | null> {
  const rows = await db
    .select({
      id: orders.id,
      paymentProvider: orders.paymentProvider,
      paymentStatus: orders.paymentStatus,
      currency: orders.currency,
      totalAmountMinor: orders.totalAmountMinor,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  return rows[0] ?? null;
}

async function findAttemptByIdempotencyKey(
  idempotencyKey: string
): Promise<PaymentAttemptRow | null> {
  const rows = await db
    .select()
    .from(paymentAttempts)
    .where(
      and(
        eq(paymentAttempts.provider, 'monobank'),
        eq(paymentAttempts.idempotencyKey, idempotencyKey)
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

async function findActiveAttempt(orderId: string): Promise<PaymentAttemptRow | null> {
  const rows = await db
    .select()
    .from(paymentAttempts)
    .where(
      and(
        eq(paymentAttempts.orderId, orderId),
        eq(paymentAttempts.provider, 'monobank'),
        inArray(paymentAttempts.status, [...ACTIVE_ATTEMPT_STATUSES])
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

async function readMaxAttemptNumber(orderId: string): Promise<number> {
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
  idempotencyKey: string;
  expectedAmountMinor: number;
  maxAttempts: number;
}): Promise<PaymentAttemptRow> {
  const nextAttemptNumber = (await readMaxAttemptNumber(args.orderId)) + 1;
  if (nextAttemptNumber > args.maxAttempts) {
    throw new InvalidPayloadError('Payment attempts exhausted.', {
      code: 'PAYMENT_ATTEMPTS_EXHAUSTED',
    });
  }

  const now = new Date();
  const walletMetadata = {
    requested: 'google_pay',
    submitOutcome: 'creating',
    lastSubmitAt: now.toISOString(),
  };
  const inserted = await db
    .insert(paymentAttempts)
    .values({
      orderId: args.orderId,
      provider: 'monobank',
      status: 'creating',
      attemptNumber: nextAttemptNumber,
      currency: MONO_CURRENCY,
      expectedAmountMinor: args.expectedAmountMinor,
      idempotencyKey: args.idempotencyKey,
      metadata: {
        monobank: {
          wallet: walletMetadata,
        },
        wallet: walletMetadata,
      },
    })
    .returning();

  const row = inserted[0];
  if (!row) throw new Error('Failed to create Monobank wallet attempt');
  return row;
}

function mergeWalletMetadata(
  current: unknown,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const meta = asRecord(current);
  const wallet = asRecord(meta.wallet);
  const monobank = asRecord(meta.monobank);
  const monobankWallet = asRecord(monobank.wallet);
  return {
    ...meta,
    monobank: {
      ...monobank,
      wallet: {
        ...monobankWallet,
        ...patch,
      },
    },
    wallet: {
      ...wallet,
      ...patch,
    },
  };
}

async function persistAttemptSubmitted(args: {
  attempt: PaymentAttemptRow;
  pspResult: MonobankWalletPaymentResult;
}): Promise<void> {
  const now = new Date();
  const invoiceId =
    args.pspResult.invoiceId ??
    (typeof args.attempt.providerPaymentIntentId === 'string' &&
    args.attempt.providerPaymentIntentId.trim()
      ? args.attempt.providerPaymentIntentId.trim()
      : null);

  const syncStatus =
    args.pspResult.status ??
    (args.pspResult.redirectUrl ? 'redirect_required' : 'submitted');

  const nextMetadata = mergeWalletMetadata(args.attempt.metadata, {
    requested: 'google_pay',
    submitOutcome: 'submitted',
    syncStatus,
    invoiceId,
    redirectUrl: args.pspResult.redirectUrl,
    providerModifiedAt: args.pspResult.modifiedDate
      ? args.pspResult.modifiedDate.toISOString()
      : null,
    tdsUrlPresent: !!args.pspResult.redirectUrl,
    lastSubmitAt: now.toISOString(),
  });

  await db
    .update(paymentAttempts)
    .set({
      status: 'active',
      providerPaymentIntentId: invoiceId,
      providerModifiedAt: args.pspResult.modifiedDate ?? null,
      metadata: nextMetadata,
      updatedAt: now,
      lastErrorCode: null,
      lastErrorMessage: null,
    })
    .where(eq(paymentAttempts.id, args.attempt.id));
}

async function persistAttemptUnknown(args: {
  attempt: PaymentAttemptRow;
  errorCode: string;
  errorMessage: string;
}): Promise<void> {
  const now = new Date();
  const nextMetadata = mergeWalletMetadata(args.attempt.metadata, {
    requested: 'google_pay',
    submitOutcome: 'unknown',
    syncStatus: 'unknown',
    unknownReason: args.errorCode,
    lastSubmitAt: now.toISOString(),
  });

  await db
    .update(paymentAttempts)
    .set({
      status: 'active',
      metadata: nextMetadata,
      updatedAt: now,
      lastErrorCode: args.errorCode,
      lastErrorMessage: args.errorMessage,
    })
    .where(eq(paymentAttempts.id, args.attempt.id));
}

async function persistAttemptRejected(args: {
  attempt: PaymentAttemptRow;
  errorCode: string;
  errorMessage: string;
}): Promise<void> {
  const now = new Date();
  const nextMetadata = mergeWalletMetadata(args.attempt.metadata, {
    requested: 'google_pay',
    submitOutcome: 'rejected',
    syncStatus: 'rejected',
    rejectCode: args.errorCode,
    lastSubmitAt: now.toISOString(),
  });

  await db
    .update(paymentAttempts)
    .set({
      status: 'failed',
      finalizedAt: now,
      updatedAt: now,
      metadata: nextMetadata,
      lastErrorCode: args.errorCode,
      lastErrorMessage: args.errorMessage,
    })
    .where(eq(paymentAttempts.id, args.attempt.id));
}

type SubmitMonobankWalletDeps = {
  readWalletOrder: typeof readWalletOrder;
  findAttemptByIdempotencyKey: typeof findAttemptByIdempotencyKey;
  findActiveAttempt: typeof findActiveAttempt;
  createCreatingAttempt: typeof createCreatingAttempt;
  persistAttemptSubmitted: typeof persistAttemptSubmitted;
  persistAttemptUnknown: typeof persistAttemptUnknown;
  persistAttemptRejected: typeof persistAttemptRejected;
  walletPayment: typeof walletPayment;
};

async function submitMonobankWalletPaymentImpl(
  deps: SubmitMonobankWalletDeps,
  args: {
    orderId: string;
    idempotencyKey: string;
    cardToken: string;
    redirectUrl: string;
    webHookUrl: string;
    maxAttempts?: number;
  }
): Promise<MonobankWalletSubmitResult> {
  const idempotencyKey = args.idempotencyKey.trim();
  if (!idempotencyKey) {
    throw new InvalidPayloadError('Idempotency-Key is required.', {
      code: 'MISSING_IDEMPOTENCY_KEY',
    });
  }

  const order = await deps.readWalletOrder(args.orderId);
  if (!order) throw new OrderNotFoundError('Order not found');
  assertWalletOrderPayable(order);

  const byIdempotencyKey = await deps.findAttemptByIdempotencyKey(idempotencyKey);
  if (byIdempotencyKey) {
    if (byIdempotencyKey.orderId !== args.orderId) {
      throw new IdempotencyConflictError(
        'Idempotency key already used for a different order.',
        {
          orderId: args.orderId,
          existingOrderId: byIdempotencyKey.orderId,
        }
      );
    }

    if (byIdempotencyKey.status === 'failed') {
      throw new InvalidPayloadError(
        'Payment attempt already failed for this idempotency key.',
        {
          code:
            byIdempotencyKey.lastErrorCode && byIdempotencyKey.lastErrorCode.trim()
              ? byIdempotencyKey.lastErrorCode
              : 'WALLET_ATTEMPT_FAILED',
        }
      );
    }

    return readReplayResult(byIdempotencyKey, true);
  }

  const activeAttempt = await deps.findActiveAttempt(args.orderId);
  if (activeAttempt) {
    if (activeAttempt.idempotencyKey !== idempotencyKey) {
      throw new MonobankWalletConflictError({
        orderId: args.orderId,
        attemptId: activeAttempt.id,
        activeIdempotencyKey: activeAttempt.idempotencyKey,
        requestedIdempotencyKey: idempotencyKey,
      });
    }

    return readReplayResult(activeAttempt, true);
  }

  let attempt: PaymentAttemptRow;
  try {
    attempt = await deps.createCreatingAttempt({
      orderId: args.orderId,
      idempotencyKey,
      expectedAmountMinor: order.totalAmountMinor,
      maxAttempts: args.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    const retryByKey = await deps.findAttemptByIdempotencyKey(idempotencyKey);
    if (retryByKey && retryByKey.orderId === args.orderId) {
      if (retryByKey.status === 'failed') {
        throw new InvalidPayloadError(
          'Payment attempt already failed for this idempotency key.',
          {
            code:
              retryByKey.lastErrorCode && retryByKey.lastErrorCode.trim()
                ? retryByKey.lastErrorCode
                : 'WALLET_ATTEMPT_FAILED',
          }
        );
      }
      return readReplayResult(retryByKey, true);
    }

    const retryActive = await deps.findActiveAttempt(args.orderId);
    if (retryActive) {
      if (retryActive.idempotencyKey !== idempotencyKey) {
        throw new MonobankWalletConflictError({
          orderId: args.orderId,
          attemptId: retryActive.id,
          activeIdempotencyKey: retryActive.idempotencyKey,
          requestedIdempotencyKey: idempotencyKey,
        });
      }
      return readReplayResult(retryActive, true);
    }

    throw error;
  }

  try {
    const pspResult = await deps.walletPayment({
      cardToken: args.cardToken,
      amountMinor: order.totalAmountMinor,
      ccy: MONO_CCY,
      initiationKind: 'client',
      redirectUrl: args.redirectUrl,
      webHookUrl: args.webHookUrl,
    });

    await deps.persistAttemptSubmitted({
      attempt,
      pspResult,
    });

    return {
      attemptId: attempt.id,
      attemptNumber: attempt.attemptNumber,
      invoiceId: pspResult.invoiceId,
      redirectUrl: pspResult.redirectUrl,
      outcome: 'submitted',
      syncStatus:
        pspResult.status ??
        (pspResult.redirectUrl ? 'redirect_required' : 'submitted'),
      providerModifiedAt: pspResult.modifiedDate,
      reused: false,
    };
  } catch (error) {
    const errorCode =
      error instanceof PspError && error.code
        ? error.code
        : 'PSP_UNKNOWN';
    const errorMessage =
      error instanceof Error && error.message ? error.message : 'PSP request failed';

    if (
      errorCode === 'PSP_TIMEOUT' ||
      errorCode === 'PSP_UPSTREAM' ||
      errorCode === 'PSP_UNKNOWN'
    ) {
      await deps.persistAttemptUnknown({
        attempt,
        errorCode,
        errorMessage,
      });

      return {
        attemptId: attempt.id,
        attemptNumber: attempt.attemptNumber,
        invoiceId: null,
        redirectUrl: null,
        outcome: 'unknown',
        syncStatus: 'unknown',
        providerModifiedAt: null,
        reused: false,
      };
    }

    await deps.persistAttemptRejected({
      attempt,
      errorCode,
      errorMessage,
    });

    throw error;
  }
}

export async function submitMonobankWalletPayment(args: {
  orderId: string;
  idempotencyKey: string;
  cardToken: string;
  redirectUrl: string;
  webHookUrl: string;
  maxAttempts?: number;
}): Promise<MonobankWalletSubmitResult> {
  return submitMonobankWalletPaymentImpl(
    {
      readWalletOrder,
      findAttemptByIdempotencyKey,
      findActiveAttempt,
      createCreatingAttempt,
      persistAttemptSubmitted,
      persistAttemptUnknown,
      persistAttemptRejected,
      walletPayment,
    },
    args
  );
}

export const __test__ = {
  submitMonobankWalletPaymentImpl,
  readReplayResult,
};
