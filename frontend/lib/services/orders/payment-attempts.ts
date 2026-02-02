import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { paymentAttempts } from '@/db/schema';
import { readStripePaymentIntentParams } from '@/lib/services/orders/payment-intent';
import { createPaymentIntent, retrievePaymentIntent } from '@/lib/psp/stripe';
import { setOrderPaymentIntent } from '@/lib/services/orders';
import { logError } from '@/lib/logging';
import { OrderStateInvalidError } from '@/lib/services/errors';

export type PaymentProvider = 'stripe';
export type PaymentAttemptStatus =
  | 'active'
  | 'succeeded'
  | 'failed'
  | 'canceled';

const DEFAULT_MAX_ATTEMPTS = 3;

export class PaymentAttemptsExhaustedError extends Error {
  readonly code = 'PAYMENT_ATTEMPTS_EXHAUSTED';
  constructor(
    public readonly orderId: string,
    public readonly provider: PaymentProvider
  ) {
    super(`Payment attempts exhausted for order ${orderId} (${provider})`);
  }
}

type PaymentAttemptRow = typeof paymentAttempts.$inferSelect;

async function getActiveAttempt(
  orderId: string,
  provider: PaymentProvider
): Promise<PaymentAttemptRow | null> {
  const rows = await db
    .select()
    .from(paymentAttempts)
    .where(
      and(
        eq(paymentAttempts.orderId, orderId),
        eq(paymentAttempts.provider, provider),
        eq(paymentAttempts.status, 'active')
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

async function getMaxAttemptNumber(
  orderId: string,
  provider: PaymentProvider
): Promise<number> {
  const rows = await db
    .select({
      max: sql<number>`coalesce(max(${paymentAttempts.attemptNumber}), 0)`,
    })
    .from(paymentAttempts)
    .where(
      and(
        eq(paymentAttempts.orderId, orderId),
        eq(paymentAttempts.provider, provider)
      )
    );

  return rows[0]?.max ?? 0;
}

async function createActiveAttempt(
  orderId: string,
  provider: PaymentProvider,
  maxAttempts: number
): Promise<PaymentAttemptRow> {
  const next = (await getMaxAttemptNumber(orderId, provider)) + 1;

  if (next > maxAttempts) {
    throw new PaymentAttemptsExhaustedError(orderId, provider);
  }

  const idempotencyKey = `pi:${provider}:${orderId}:${next}`;

  try {
    const inserted = await db
      .insert(paymentAttempts)
      .values({
        orderId,
        provider,
        status: 'active',
        attemptNumber: next,
        idempotencyKey,
        metadata: {},
      })
      .returning();

    const row = inserted[0];
    if (!row) throw new Error('Failed to insert payment_attempts row');
    return row;
  } catch (e) {
    const existing = await getActiveAttempt(orderId, provider);
    if (existing) return existing;
    throw e;
  }
}

async function upsertBackfillAttemptForExistingPI(args: {
  orderId: string;
  provider: PaymentProvider;
  paymentIntentId: string;
  maxAttempts: number;
}): Promise<PaymentAttemptRow> {
  const { orderId, provider, paymentIntentId, maxAttempts } = args;

  const found = await db
    .select()
    .from(paymentAttempts)
    .where(
      and(
        eq(paymentAttempts.provider, provider),
        eq(paymentAttempts.providerPaymentIntentId, paymentIntentId)
      )
    )
    .limit(1);

  const existingAttempt = found[0] ?? null;
  if (existingAttempt) {
    if (existingAttempt.orderId === orderId) return existingAttempt;

    throw new OrderStateInvalidError(
      'PaymentIntent is already associated with a different order.',
      {
        orderId,
        field: 'providerPaymentIntentId',
        rawValue: paymentIntentId,
        details: {
          provider,
          paymentIntentId,
          existingOrderId: existingAttempt.orderId,
        },
      }
    );
  }

  const max = await getMaxAttemptNumber(orderId, provider);
  const next = max + 1;

  if (next > maxAttempts) {
    throw new PaymentAttemptsExhaustedError(orderId, provider);
  }

  const idempotencyKey = `pi:${provider}:${orderId}:${next}`;

  try {
    const inserted = await db
      .insert(paymentAttempts)
      .values({
        orderId,
        provider,
        status: 'active',
        attemptNumber: next,
        idempotencyKey,
        providerPaymentIntentId: paymentIntentId,
        metadata: { backfilled: true },
      })
      .returning();

    return inserted[0]!;
  } catch (e) {
    const active = await getActiveAttempt(orderId, provider);
    if (active) return active;
    throw e;
  }
}

export async function ensureStripePaymentIntentForOrder(args: {
  orderId: string;
  existingPaymentIntentId?: string | null;
  maxAttempts?: number;
}): Promise<{
  paymentIntentId: string;
  clientSecret: string;
  attemptId: string;
  attemptNumber: number;
}> {
  const { orderId, existingPaymentIntentId } = args;
  const provider: PaymentProvider = 'stripe';
  const maxAttempts = args.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  let attempt = await getActiveAttempt(orderId, provider);

  if (!attempt && existingPaymentIntentId && existingPaymentIntentId.trim()) {
    attempt = await upsertBackfillAttemptForExistingPI({
      orderId,
      provider,
      paymentIntentId: existingPaymentIntentId.trim(),
      maxAttempts,
    });
  }
  if (!attempt) {
    attempt = await createActiveAttempt(orderId, provider, maxAttempts);
  }

  if (
    attempt.providerPaymentIntentId &&
    attempt.providerPaymentIntentId.trim()
  ) {
    const pi = await retrievePaymentIntent(
      attempt.providerPaymentIntentId.trim()
    );

    if (pi.status === 'canceled') {
      await db
        .update(paymentAttempts)
        .set({
          status: 'canceled',
          finalizedAt: new Date(),
          updatedAt: new Date(),
          lastErrorCode: 'canceled',
          lastErrorMessage: 'PaymentIntent canceled',
        })
        .where(eq(paymentAttempts.id, attempt.id));

      const nextAttempt = await createActiveAttempt(
        orderId,
        provider,
        maxAttempts
      );

      const snapshot = await readStripePaymentIntentParams(orderId);
      const created = await createPaymentIntent({
        amount: snapshot.amountMinor,
        currency: snapshot.currency,
        orderId,
        idempotencyKey: nextAttempt.idempotencyKey,
      });

      await db
        .update(paymentAttempts)
        .set({
          providerPaymentIntentId: created.paymentIntentId,
          updatedAt: new Date(),
        })
        .where(eq(paymentAttempts.id, nextAttempt.id));

      await setOrderPaymentIntent({
        orderId,
        paymentIntentId: created.paymentIntentId,
      });

      return {
        paymentIntentId: created.paymentIntentId,
        clientSecret: created.clientSecret,
        attemptId: nextAttempt.id,
        attemptNumber: nextAttempt.attemptNumber,
      };
    }

    return {
      paymentIntentId: attempt.providerPaymentIntentId.trim(),
      clientSecret: pi.clientSecret,
      attemptId: attempt.id,
      attemptNumber: attempt.attemptNumber,
    };
  }

  try {
    const snapshot = await readStripePaymentIntentParams(orderId);

    const created = await createPaymentIntent({
      amount: snapshot.amountMinor,
      currency: snapshot.currency,
      orderId,
      idempotencyKey: attempt.idempotencyKey,
    });

    await db
      .update(paymentAttempts)
      .set({
        providerPaymentIntentId: created.paymentIntentId,
        updatedAt: new Date(),
      })
      .where(eq(paymentAttempts.id, attempt.id));

    await setOrderPaymentIntent({
      orderId,
      paymentIntentId: created.paymentIntentId,
    });

    return {
      paymentIntentId: created.paymentIntentId,
      clientSecret: created.clientSecret,
      attemptId: attempt.id,
      attemptNumber: attempt.attemptNumber,
    };
  } catch (error) {
    logError('payment_attempt_pi_create_failed', error, {
      orderId,
      attemptId: attempt.id,
    });

    await db
      .update(paymentAttempts)
      .set({
        status: 'failed',
        finalizedAt: new Date(),
        updatedAt: new Date(),
        lastErrorCode: 'pi_create_failed',
        lastErrorMessage:
          error instanceof Error ? error.message : 'Unknown error',
      })
      .where(eq(paymentAttempts.id, attempt.id));

    throw error;
  }
}

export async function markStripeAttemptFinal(args: {
  paymentIntentId: string;
  status: 'succeeded' | 'failed' | 'canceled';
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  try {
    const { paymentIntentId, status, errorCode, errorMessage } = args;

    const mapped: PaymentAttemptStatus =
      status === 'succeeded'
        ? 'succeeded'
        : status === 'canceled'
          ? 'canceled'
          : 'failed';

    await db
      .update(paymentAttempts)
      .set({
        status: mapped,
        finalizedAt: new Date(),
        updatedAt: new Date(),
        lastErrorCode:
          errorCode ?? (mapped === 'failed' ? 'payment_failed' : null),
        lastErrorMessage: errorMessage ?? null,
      })
      .where(eq(paymentAttempts.providerPaymentIntentId, paymentIntentId));
  } catch (error) {
    logError('payment_attempt_finalize_failed', error, {
      paymentIntentId: args.paymentIntentId,
      status: args.status,
    });
    return;
  }
}
