import { and, eq, inArray, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { orders } from '@/db/schema/shop';
import { logWarn } from '@/lib/logging';
import type { PaymentProvider, PaymentStatus } from '@/lib/shop/payments';

export type PaymentTransitionSource =
  | 'checkout'
  | 'payment_intent'
  | 'stripe_webhook'
  | 'monobank_webhook'
  | 'admin'
  | 'janitor'
  | 'system';

// Stripe/Monobank flow transitions
const ALLOWED_FROM_STRIPE: Record<PaymentStatus, readonly PaymentStatus[]> = {
  pending: ['requires_payment'],
  requires_payment: ['pending'],
  paid: ['pending', 'requires_payment'],
  failed: ['pending', 'requires_payment'],
  refunded: ['paid', 'pending', 'requires_payment'],
  // allow entering "needs_review" from anywhere (triage state)
  needs_review: [
    'pending',
    'requires_payment',
    'paid',
    'failed',
    'refunded',
    'needs_review',
  ],
};

// payment_provider='none' (no-payments) rules:
// DB CHECK already enforces only ('paid','failed'), and in this workflow 'paid' is not finality.
// We allow paid -> failed (e.g. inventory failed / stale orphan), but NOT failed -> paid.
const ALLOWED_FROM_NONE: Record<PaymentStatus, readonly PaymentStatus[]> = {
  pending: [],
  requires_payment: [],
  paid: ['paid'],
  failed: ['paid', 'failed'],
  refunded: [],
  // provider='none': DB CHECK typically disallows needs_review (only paid/failed)
  needs_review: [],
};

function allowedFrom(
  provider: PaymentProvider,
  to: PaymentStatus
): readonly PaymentStatus[] {
  return provider === 'none' ? ALLOWED_FROM_NONE[to] : ALLOWED_FROM_STRIPE[to];
}

function isAllowed(
  provider: PaymentProvider,
  from: PaymentStatus,
  to: PaymentStatus
): boolean {
  if (from === to) return true;
  return allowedFrom(provider, to).includes(from);
}

function hasSetFields(set: unknown): boolean {
  if (!set || typeof set !== 'object') return false;
  return Object.keys(set as Record<string, unknown>).length > 0;
}

export type GuardedPaymentUpdateArgs = {
  orderId: string;

  paymentProvider: PaymentProvider;

  to: PaymentStatus;

  set?: Partial<Omit<typeof orders.$inferInsert, 'paymentStatus' | 'id'>>;

  extraWhere?: SQL;

  allowSameStateUpdate?: boolean;

  source: PaymentTransitionSource;
  eventId?: string;
  note?: string;
};

export type GuardedPaymentUpdateResult =
  | { applied: true }
  | {
      applied: false;
      reason:
        | 'NOT_FOUND'
        | 'PROVIDER_MISMATCH'
        | 'ALREADY_IN_STATE'
        | 'INVALID_TRANSITION'
        | 'BLOCKED';
      from?: PaymentStatus;
      currentProvider?: PaymentProvider;
    };

async function getCurrentState(orderId: string): Promise<{
async function getCurrentState(orderId: string): Promise<{
  paymentStatus: PaymentStatus;
  paymentProvider: PaymentProvider;
} | null> {
  const row = await db
    .select({
      paymentStatus: orders.paymentStatus,
      paymentProvider: orders.paymentProvider,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  return row[0] ?? null;
}

export async function guardedPaymentStatusUpdate(
  args: GuardedPaymentUpdateArgs
): Promise<GuardedPaymentUpdateResult> {
  const { orderId, paymentProvider, to, source, eventId, note } = args;

  if (
    paymentProvider === 'none' &&
    (to === 'pending' ||
      to === 'requires_payment' ||
      to === 'refunded' ||
      to === 'needs_review')
  ) {
    const current = await getCurrentState(orderId);
    if (!current) return { applied: false, reason: 'NOT_FOUND' };

    logWarn('payment_transition_rejected', {
      orderId,
      from: current.paymentStatus,
      to,
      source,
      eventId,
      note,
      paymentProvider,
      reason: 'provider_none_disallows_target',
    });

    return {
      applied: false,
      reason: 'INVALID_TRANSITION',
      from: current.paymentStatus,
      currentProvider: current.paymentProvider,
    };
  }

  const baseAllowed = allowedFrom(paymentProvider, to);
  const allowSame = args.allowSameStateUpdate ?? hasSetFields(args.set);

  const eligibleFrom = allowSame
    ? Array.from(new Set([...baseAllowed, to]))
    : baseAllowed;

  if (!eligibleFrom.length) {
    const current = await getCurrentState(orderId);
    if (!current) return { applied: false, reason: 'NOT_FOUND' };

    logWarn('payment_transition_rejected', {
      orderId,
      from: current.paymentStatus,
      to,
      source,
      eventId,
      note,
      paymentProvider,
      reason: 'empty_eligible_from',
    });

    return {
      applied: false,
      reason: 'INVALID_TRANSITION',
      from: current.paymentStatus,
      currentProvider: current.paymentProvider,
    };
  }

  const whereParts: SQL[] = [
    eq(orders.id, orderId),
    eq(orders.paymentProvider, paymentProvider),
    inArray(orders.paymentStatus, eligibleFrom),
  ];

  if (args.extraWhere) whereParts.push(args.extraWhere);

  const updated = await db
    .update(orders)
    .set({
      ...(args.set ?? {}),
      paymentStatus: to,
    })
    .where(and(...whereParts))
    .returning({ id: orders.id });

  if (updated.length > 0) return { applied: true };

  const current = await getCurrentState(orderId);
  if (!current) return { applied: false, reason: 'NOT_FOUND' };

  if (current.paymentProvider !== paymentProvider) {
    logWarn('payment_transition_rejected', {
      orderId,
      from: current.paymentStatus,
      to,
      source,
      eventId,
      note,
      paymentProvider,
      currentProvider: current.paymentProvider,
      reason: 'provider_mismatch',
    });
    return {
      applied: false,
      reason: 'PROVIDER_MISMATCH',
      from: current.paymentStatus,
      currentProvider: current.paymentProvider,
    };
  }

  if (current.paymentStatus === to) {
    return {
      applied: false,
      reason: 'ALREADY_IN_STATE',
      from: current.paymentStatus,
      currentProvider: current.paymentProvider,
    };
  }

  if (!isAllowed(paymentProvider, current.paymentStatus, to)) {
    logWarn('payment_transition_rejected', {
      orderId,
      from: current.paymentStatus,
      to,
      source,
      eventId,
      note,
      paymentProvider,
      reason: 'invalid_transition',
    });
    return {
      applied: false,
      reason: 'INVALID_TRANSITION',
      from: current.paymentStatus,
      currentProvider: current.paymentProvider,
    };
  }

  return {
    applied: false,
    reason: 'BLOCKED',
    from: current.paymentStatus,
    currentProvider: current.paymentProvider,
  };
}

export const __paymentTransitions = { isAllowed, allowedFrom };
