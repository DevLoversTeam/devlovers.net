import Stripe from 'stripe';
import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, ne, or, isNull, lt } from 'drizzle-orm';
import { db } from '@/db';
import { verifyWebhookSignature, retrieveCharge } from '@/lib/psp/stripe';
import { orders, stripeEvents } from '@/db/schema';
import { restockOrder } from '@/lib/services/orders';
import { guardedPaymentStatusUpdate } from '@/lib/services/orders/payment-state';
import { logError, logInfo, logWarn } from '@/lib/logging';
import {
  type RefundMetaRecord,
  appendRefundToMeta,
} from '@/lib/services/orders/psp-metadata/refunds';
import { markStripeAttemptFinal } from '@/lib/services/orders/payment-attempts';
import {
  enforceRateLimit,
  getClientIp,
  rateLimitResponse,
} from '@/lib/security/rate-limit';

const REFUND_FULLNESS_UNDETERMINED = 'REFUND_FULLNESS_UNDETERMINED' as const;

// P0.8: multi-instance claim/lock (no transactions; safe under parallel deliveries)
const STRIPE_WEBHOOK_INSTANCE_ID =
  (
    process.env.STRIPE_WEBHOOK_INSTANCE_ID ??
    process.env.WEBHOOK_INSTANCE_ID ??
    ''
  ).trim() || crypto.randomUUID().slice(0, 12);

const STRIPE_EVENT_CLAIM_TTL_MS = 10 * 60 * 1000; // 10 minutes
const STRIPE_EVENT_RETRY_AFTER_SECONDS = 10;

function busyRetry() {
  return NextResponse.json(
    {
      code: 'WEBHOOK_CLAIMED',
      retryAfterSeconds: STRIPE_EVENT_RETRY_AFTER_SECONDS,
    },
    {
      status: 503,
      headers: { 'Retry-After': String(STRIPE_EVENT_RETRY_AFTER_SECONDS) },
    }
  );
}
async function tryClaimStripeEvent(
  eventId: string
): Promise<'claimed' | 'already_processed' | 'busy'> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + STRIPE_EVENT_CLAIM_TTL_MS);

  const claimed = await db
    .update(stripeEvents)
    .set({
      claimedAt: now,
      claimExpiresAt: expiresAt,
      claimedBy: STRIPE_WEBHOOK_INSTANCE_ID,
    })
    .where(
      and(
        eq(stripeEvents.eventId, eventId),
        isNull(stripeEvents.processedAt),
        or(
          isNull(stripeEvents.claimedAt),
          isNull(stripeEvents.claimExpiresAt),
          lt(stripeEvents.claimExpiresAt, now)
        )
      )
    )
    .returning({ eventId: stripeEvents.eventId });

  if (claimed.length > 0) return 'claimed';

  const [row] = await db
    .select({
      processedAt: stripeEvents.processedAt,
      claimExpiresAt: stripeEvents.claimExpiresAt,
      claimedBy: stripeEvents.claimedBy,
    })
    .from(stripeEvents)
    .where(eq(stripeEvents.eventId, eventId))
    .limit(1);

  if (row?.processedAt) return 'already_processed';
  return 'busy';
}

function throwRefundFullnessUndetermined(): never {
  throw new Error(REFUND_FULLNESS_UNDETERMINED);
}

function isRefundFullnessUndeterminedError(err: unknown): boolean {
  return err instanceof Error && err.message === REFUND_FULLNESS_UNDETERMINED;
}

function upsertRefundIntoMeta(params: {
  prevMeta: unknown;
  refund: { id: string; amount?: number | null; status?: string | null } | null;
  eventId: string;
  currency: string;
  createdAtIso: string;
}): any {
  const { prevMeta, refund, eventId, currency, createdAtIso } = params;

  const base =
    prevMeta && typeof prevMeta === 'object' && !Array.isArray(prevMeta)
      ? (prevMeta as any)
      : {};

  if (!refund?.id) return base;

  const rec: RefundMetaRecord = {
    refundId: refund.id,
    idempotencyKey: `webhook:${eventId}`.slice(0, 128),
    amountMinor: Number(refund.amount ?? 0),
    currency,
    createdAt: createdAtIso,
    createdBy: 'webhook',
    status: refund.status ?? null,
  };

  return appendRefundToMeta({ prevMeta: base, record: rec });
}

function warnRefundFullnessUndetermined(payload: {
  eventId: string;
  eventType: string;
  chargeId: string | null;
  chargeAmount: number | null;
  cumulativeRefunded: number | null;
  hasRefundObject: boolean;
  refundsListLength: number | null;
  hasAmountRefundedField: boolean;
  reason: string;
  orderId?: string;
  paymentIntentId?: string | null;
  refundId?: string | null;
  refundAmount?: number | null;
}) {
  logWarn('stripe_webhook_refund_fullness_undetermined', payload);
}

function logWebhookEvent(payload: {
  orderId?: string;
  paymentIntentId?: string | null;
  paymentStatus?: string | null;
  eventType: string;
}) {
  const { orderId, paymentIntentId, paymentStatus, eventType } = payload;

  logInfo('stripe_webhook', {
    provider: 'stripe',
    orderId,
    paymentIntentId,
    paymentStatus,
    eventType,
  });
}
type PaymentIntentWithCharges = Stripe.PaymentIntent & {
  charges?: { data?: Stripe.Charge[] };
};

function getLatestCharge(paymentIntent?: PaymentIntentWithCharges) {
  const charges = paymentIntent?.charges?.data;
  if (!charges || charges.length === 0) return undefined;
  return charges[0];
}

function getLatestChargeId(
  paymentIntent?: Stripe.PaymentIntent
): string | null {
  const lc = paymentIntent?.latest_charge;
  if (!lc) return null;
  if (typeof lc === 'string') return lc.trim().length > 0 ? lc : null;
  if (typeof lc === 'object' && 'id' in lc && typeof lc.id === 'string') {
    return lc.id;
  }
  return null;
}

function resolvePaymentMethod(
  paymentIntent?: Stripe.PaymentIntent,
  charge?: Stripe.Charge
) {
  const paymentMethodFromIntent =
    typeof paymentIntent?.payment_method === 'string'
      ? paymentIntent.payment_method
      : paymentIntent?.payment_method?.id;

  const paymentMethodFromCharge =
    (typeof charge?.payment_method === 'string'
      ? charge.payment_method
      : undefined) ?? charge?.payment_method_details?.type;

  return paymentMethodFromIntent ?? paymentMethodFromCharge ?? null;
}

function buildPspMetadata(params: {
  eventType: string;
  paymentIntent?: Stripe.PaymentIntent;
  charge?: Stripe.Charge;
  refund?: Stripe.Refund | null;
  extra?: Record<string, unknown>;
}) {
  const charge = params.charge ?? getLatestCharge(params.paymentIntent);
  const refund = params.refund ?? charge?.refunds?.data?.[0];
  const lastPaymentError = params.paymentIntent?.last_payment_error;

  return {
    eventType: params.eventType,
    paymentIntentStatus: params.paymentIntent?.status,
    chargeStatus: charge?.status,
    outcome: charge?.outcome
      ? {
          network_status: charge.outcome.network_status,
          reason: charge.outcome.reason,
          risk_level: charge.outcome.risk_level,
          seller_message: charge.outcome.seller_message,
          type: charge.outcome.type,
        }
      : undefined,
    lastPaymentError: lastPaymentError
      ? {
          code: lastPaymentError.code,
          decline_code: lastPaymentError.decline_code,
          type: lastPaymentError.type,
          doc_url: lastPaymentError.doc_url,
        }
      : undefined,
    cancellationReason: params.paymentIntent?.cancellation_reason,
    refund: refund
      ? {
          id: refund.id,
          status: refund.status,
          reason: refund.reason,
          amount: refund.amount,
        }
      : undefined,
    receiptEmail: params.paymentIntent?.receipt_email ?? charge?.receipt_email,
    paymentMethodDetails: charge?.payment_method_details
      ? { type: charge.payment_method_details.type }
      : undefined,
    ...(params.extra ?? {}),
  };
}

function stripUndefined(obj: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function mergePspMetadata(params: {
  prevMeta: unknown;
  delta: Record<string, unknown>;
  eventId: string;
  currency: string;
  createdAtIso: string;
}) {
  const cleanedDelta = stripUndefined(params.delta);

  const refundForUpsert = (cleanedDelta as any)?.refund?.id
    ? {
        id: String((cleanedDelta as any).refund.id),
        amount:
          typeof (cleanedDelta as any).refund.amount === 'number'
            ? (cleanedDelta as any).refund.amount
            : null,
        status:
          typeof (cleanedDelta as any).refund.status === 'string'
            ? (cleanedDelta as any).refund.status
            : null,
      }
    : null;

  const metaWithRefunds = upsertRefundIntoMeta({
    prevMeta: params.prevMeta,
    refund: refundForUpsert,
    eventId: params.eventId,
    currency: params.currency,
    createdAtIso: params.createdAtIso,
  });

  // Do NOT allow delta to overwrite refunds/refundInitiatedAt (canonical fields managed by upsertRefundIntoMeta)
  const safeDelta: any = { ...cleanedDelta };
  delete safeDelta.refunds;
  delete safeDelta.refundInitiatedAt;

  return {
    ...metaWithRefunds,
    ...safeDelta,
  };
}
function shouldRestockFromWebhook(order: {
  stockRestored: boolean | null;
  inventoryStatus: string | null;
}) {
  // Webhook-level gate: avoid unnecessary calls when we already restored stock
  // or inventory has already been released.
  if (order.stockRestored === true) return false;
  if (order.inventoryStatus === 'released') return false;
  return true;
}

export async function POST(request: NextRequest) {
  let rawBody: string;

  try {
    rawBody = await request.text();
  } catch (error) {
    logError('Failed to read Stripe webhook body', error);
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    const ip = getClientIp(request) ?? 'anon';
    const decision = await enforceRateLimit({
      key: `stripe_webhook:missing_sig:${ip}`,
      limit: Number(process.env.STRIPE_WEBHOOK_INVALID_SIG_RL_MAX ?? 30),
      windowSeconds: Number(
        process.env.STRIPE_WEBHOOK_INVALID_SIG_RL_WINDOW_SECONDS ?? 60
      ),
    });

    if (!decision.ok) {
      return rateLimitResponse({
        retryAfterSeconds: decision.retryAfterSeconds,
        details: { scope: 'stripe_webhook', reason: 'missing_signature' },
      });
    }

    logError(
      'Stripe webhook missing signature header',
      new Error('MISSING_STRIPE_SIGNATURE')
    );
    return NextResponse.json({ code: 'INVALID_SIGNATURE' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = verifyWebhookSignature({ rawBody, signatureHeader: signature });
  } catch (error) {
    if (error instanceof Error && error.message === 'STRIPE_WEBHOOK_DISABLED') {
      logError('Stripe webhook disabled or misconfigured', error);
      return NextResponse.json({ code: 'WEBHOOK_DISABLED' }, { status: 500 });
    }

    if (
      error instanceof Error &&
      error.message === 'STRIPE_INVALID_SIGNATURE'
    ) {
      const ip = getClientIp(request) ?? 'anon';
      const decision = await enforceRateLimit({
        key: `stripe_webhook:invalid_sig:${ip}`,
        limit: Number(process.env.STRIPE_WEBHOOK_INVALID_SIG_RL_MAX ?? 30),
        windowSeconds: Number(
          process.env.STRIPE_WEBHOOK_INVALID_SIG_RL_WINDOW_SECONDS ?? 60
        ),
      });

      if (!decision.ok) {
        return rateLimitResponse({
          retryAfterSeconds: decision.retryAfterSeconds,
          details: { scope: 'stripe_webhook', reason: 'invalid_signature' },
        });
      }

      logError('Stripe webhook signature verification failed', error);
      return NextResponse.json({ code: 'INVALID_SIGNATURE' }, { status: 400 });
    }

    throw error;
  }

  const eventType = event.type;
  const rawObject = event.data.object;

  let paymentIntent: Stripe.PaymentIntent | undefined;
  let charge: Stripe.Charge | undefined;
  let refundObject: Stripe.Refund | undefined;

  if (eventType.startsWith('payment_intent.')) {
    paymentIntent = rawObject as Stripe.PaymentIntent;
  } else if (eventType === 'charge.refund.updated') {
    // Stripe sends Refund object for charge.refund.updated
    refundObject = rawObject as Stripe.Refund;
  } else if (eventType.startsWith('charge.')) {
    charge = rawObject as Stripe.Charge;
  }

  let paymentIntentId: string | null = null;

  if (paymentIntent && typeof paymentIntent.id === 'string') {
    paymentIntentId = paymentIntent.id;
  } else if (charge) {
    const pi = charge.payment_intent;

    if (typeof pi === 'string') {
      paymentIntentId = pi;
    } else if (
      pi &&
      typeof pi === 'object' &&
      'id' in pi &&
      typeof (pi as any).id === 'string'
    ) {
      paymentIntentId = (pi as any).id;
    }
  } else if (refundObject) {
    const pi = (refundObject as any).payment_intent;
    if (typeof pi === 'string') {
      paymentIntentId = pi;
    } else if (
      pi &&
      typeof pi === 'object' &&
      'id' in pi &&
      typeof (pi as any).id === 'string'
    ) {
      paymentIntentId = (pi as any).id;
    }
  }

  const paymentStatus: string | null =
    (paymentIntent?.status as string | null | undefined) ??
    (charge?.status as string | null | undefined) ??
    ((refundObject as any)?.status as string | null | undefined) ??
    null;

  const rawMetadata =
    rawObject && typeof rawObject === 'object' && 'metadata' in rawObject
      ? (rawObject as { metadata?: Stripe.Metadata }).metadata
      : undefined;

  const metadata: Stripe.Metadata | undefined =
    paymentIntent?.metadata ??
    charge?.metadata ??
    (refundObject as any)?.metadata ??
    rawMetadata;

  const orderId =
    typeof metadata?.orderId === 'string' && metadata.orderId.trim().length > 0
      ? metadata.orderId
      : undefined;

  if (!paymentIntentId) {
    logWebhookEvent({ eventType, paymentIntentId, paymentStatus });
    return NextResponse.json({ received: true }, { status: 200 });
  }

  try {
    const ack = async () => {
      const updated = await db
        .update(stripeEvents)
        .set({ processedAt: new Date() })
        .where(
          and(
            eq(stripeEvents.eventId, event.id),
            eq(stripeEvents.claimedBy, STRIPE_WEBHOOK_INSTANCE_ID)
          )
        )
        .returning({ eventId: stripeEvents.eventId });

      if (updated.length === 0) {
        logWarn('stripe_webhook_ack_claim_lost', {
          eventId: event.id,
          eventType,
        });
        return busyRetry();
      }

      return NextResponse.json({ received: true }, { status: 200 });
    };
    // 1) Insert event idempotently (no transactions)
    const inserted = await db
      .insert(stripeEvents)
      .values({
        provider: 'stripe',
        eventId: event.id,
        paymentIntentId,
        orderId: orderId ?? null,
        eventType,
        paymentStatus,
        processedAt: null,
      })
      .onConflictDoNothing()
      .returning({ eventId: stripeEvents.eventId });

    if (inserted.length === 0) {
      const [existing] = await db
        .select({ processedAt: stripeEvents.processedAt })
        .from(stripeEvents)
        .where(eq(stripeEvents.eventId, event.id))
        .limit(1);

      if (existing?.processedAt) {
        logInfo('stripe_webhook_duplicate_event', {
          eventId: event.id,
          eventType,
        });
        return NextResponse.json({ received: true }, { status: 200 });
      }
      // processedAt is NULL => previous attempt failed; reprocess
    }
    // P0.8: claim/lock BEFORE any business logic (multi-instance safe).
    const claimState = await tryClaimStripeEvent(event.id);
    if (claimState === 'already_processed') {
      logInfo('stripe_webhook_duplicate_event', {
        eventId: event.id,
        eventType,
        reason: 'already_processed',
      });
      return NextResponse.json({ received: true }, { status: 200 });
    }
    if (claimState === 'busy') {
      logInfo('stripe_webhook_claimed_by_other_instance', {
        eventId: event.id,
        eventType,
      });
      return busyRetry();
    }
    //2) Resolve orderId:
    //    primary: metadata.orderId
    //    fallback: orders.paymentIntentId == paymentIntentId (ONLY if unique match)
    let resolvedOrderId: string | undefined = orderId;

    if (!resolvedOrderId) {
      const candidates = await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.paymentIntentId, paymentIntentId))
        .limit(2);

      if (candidates.length === 1) {
        resolvedOrderId = candidates[0].id;
      } else {
        logWarn('stripe_webhook_missing_order_id', {
          paymentIntentId,
          eventType,
          reason:
            candidates.length === 0
              ? 'no_order_for_payment_intent'
              : 'multiple_orders_for_payment_intent',
        });
        logWebhookEvent({ eventType, paymentIntentId, paymentStatus });
        return ack();
      }
    }

    // backfill stripe_events.orderId if resolved via fallback (or to normalize)
    if (resolvedOrderId && !orderId) {
      await db
        .update(stripeEvents)
        .set({ orderId: resolvedOrderId })
        .where(eq(stripeEvents.eventId, event.id));
    }

    // 3) Load order
    const [order] = await db
      .select({
        id: orders.id,
        paymentIntentId: orders.paymentIntentId,
        totalAmountMinor: orders.totalAmountMinor,
        currency: orders.currency,
        paymentStatus: orders.paymentStatus,
        status: orders.status,
        stockRestored: orders.stockRestored,
        inventoryStatus: orders.inventoryStatus,
        pspMetadata: orders.pspMetadata,
      })
      .from(orders)
      .where(eq(orders.id, resolvedOrderId))
      .limit(1);

    if (!order) {
      logWebhookEvent({ eventType, paymentIntentId, paymentStatus });
      return ack();
    }

    if (order.paymentIntentId && order.paymentIntentId !== paymentIntentId) {
      logInfo('stripe_webhook_payment_intent_mismatch', {
        orderId: order.id,
        paymentIntentId,
        orderPaymentIntentId: order.paymentIntentId,
        eventType,
        reason: 'payment_intent_mismatch',
      });
      return ack();
    }

    // 4) Business logic per event type
    if (eventType === 'payment_intent.succeeded') {
      const stripeAmount =
        paymentIntent?.amount_received ?? paymentIntent?.amount ?? null;
      const stripeCurrency = paymentIntent?.currency;
      const orderAmountMinor = order.totalAmountMinor;

      const amountMatches = stripeAmount === orderAmountMinor;
      const currencyMatches =
        stripeCurrency?.toUpperCase() === order.currency.toUpperCase();

      if (stripeAmount == null || !amountMatches || !currencyMatches) {
        const mismatchReason =
          !amountMatches && !currencyMatches
            ? 'amount_and_currency_mismatch'
            : !amountMatches
            ? 'amount_mismatch'
            : 'currency_mismatch';

        const chargeForIntent = getLatestCharge(paymentIntent as any);
        const createdAtIso = new Date().toISOString();
        const deltaMeta = buildPspMetadata({
          eventType,
          paymentIntent,
          charge: chargeForIntent,
          extra: {
            mismatch: {
              reason: mismatchReason,
              eventId: event.id,
              expected: {
                amountMinor: orderAmountMinor,
                currency: order.currency,
              },
              actual: { amountMinor: stripeAmount, currency: stripeCurrency },
              // keep old fields for backward-compat/debug grepping
              stripeAmount,
              orderAmountMinor,
              stripeCurrency,
              orderCurrency: order.currency,
            },
          },
        });
        const nextMeta = mergePspMetadata({
          prevMeta: order.pspMetadata,
          delta: deltaMeta as any,
          eventId: event.id,
          currency: order.currency,
          createdAtIso,
        });

        await db
          .update(orders)
          .set({
            updatedAt: new Date(),
            pspStatusReason: mismatchReason,
            pspMetadata: nextMeta,
          })
          .where(eq(orders.id, order.id));

        logWarn('stripe_webhook_mismatch', {
          orderId: order.id,
          paymentIntentId,
          eventType,
          stripeAmount,
          orderAmountMinor,
          stripeCurrency,
          orderCurrency: order.currency,
          reason: mismatchReason,
        });

        await markStripeAttemptFinal({
          paymentIntentId,
          status: 'succeeded',
          errorCode: mismatchReason,
          errorMessage: 'webhook_succeeded_but_mismatch',
        });

        return ack();
      }

      const chargeForIntent = getLatestCharge(paymentIntent as any);
      const latestChargeId = getLatestChargeId(paymentIntent);

      const now = new Date();
      const createdAtIso = now.toISOString();
      const deltaMeta = buildPspMetadata({
        eventType,
        paymentIntent,
        charge: chargeForIntent ?? undefined,
      });
      const nextMeta = mergePspMetadata({
        prevMeta: order.pspMetadata,
        delta: deltaMeta as any,
        eventId: event.id,
        currency: order.currency,
        createdAtIso,
      });

      await guardedPaymentStatusUpdate({
        orderId: order.id,
        paymentProvider: 'stripe',
        to: 'paid',
        source: 'stripe_webhook',
        eventId: event.id,
        note: eventType,
        set: {
          status: 'PAID',
          updatedAt: now,
          pspChargeId: latestChargeId ?? chargeForIntent?.id ?? null,
          pspPaymentMethod: resolvePaymentMethod(
            paymentIntent,
            chargeForIntent
          ),
          pspStatusReason: paymentIntent?.status ?? 'succeeded',
          pspMetadata: nextMeta,
        },
        extraWhere: and(
          eq(orders.stockRestored, false),
          ne(orders.inventoryStatus, 'released'),
          // avoid churn when already consistent
          or(ne(orders.paymentStatus, 'paid'), ne(orders.status, 'PAID')),
          // explicit safety gates (redundant with matrix, but keep)
          ne(orders.paymentStatus, 'failed'),
          ne(orders.paymentStatus, 'refunded')
        ),
      });
      await markStripeAttemptFinal({
        paymentIntentId,
        status: 'succeeded',
      });

      logWebhookEvent({
        orderId: order.id,
        paymentIntentId,
        paymentStatus,
        eventType,
      });
      return ack();
    }
    if (eventType === 'payment_intent.payment_failed') {
      if (order.paymentStatus === 'paid') {
        logWebhookEvent({
          orderId: order.id,
          paymentIntentId,
          paymentStatus,
          eventType,
        });
        return ack();
      }
      if (order.paymentStatus === 'refunded') {
        logWebhookEvent({
          orderId: order.id,
          paymentIntentId,
          paymentStatus,
          eventType,
        });
        return ack();
      }

      const chargeForIntent = getLatestCharge(paymentIntent as any);
      const failureReason =
        paymentIntent?.last_payment_error?.decline_code ??
        paymentIntent?.last_payment_error?.code ??
        paymentIntent?.cancellation_reason ??
        paymentIntent?.status ??
        'payment_failed';
      const now = new Date();
      const createdAtIso = now.toISOString();
      const deltaMeta = buildPspMetadata({
        eventType,
        paymentIntent,
        charge: chargeForIntent,
      });
      const nextMeta = mergePspMetadata({
        prevMeta: order.pspMetadata,
        delta: deltaMeta as any,
        eventId: event.id,
        currency: order.currency,
        createdAtIso,
      });
      await guardedPaymentStatusUpdate({
        orderId: order.id,
        paymentProvider: 'stripe',
        to: 'failed',
        source: 'stripe_webhook',
        eventId: event.id,
        note: eventType,
        set: {
          updatedAt: now,
          pspChargeId: chargeForIntent?.id ?? null,
          pspPaymentMethod: resolvePaymentMethod(
            paymentIntent,
            chargeForIntent
          ),
          pspStatusReason: failureReason,
          pspMetadata: nextMeta,
        },
      });

      if (shouldRestockFromWebhook(order)) {
        await restockOrder(order.id, { reason: 'failed' });
      }

      await markStripeAttemptFinal({
        paymentIntentId,
        status: 'failed',
        errorCode:
          paymentIntent?.last_payment_error?.decline_code ??
          paymentIntent?.last_payment_error?.code ??
          null,
        errorMessage: paymentIntent?.last_payment_error?.message ?? null,
      });

      logWebhookEvent({
        orderId: order.id,
        paymentIntentId,
        paymentStatus,
        eventType,
      });
      return ack();
    }

    if (eventType === 'payment_intent.canceled') {
      if (order.paymentStatus === 'paid') {
        logWebhookEvent({
          orderId: order.id,
          paymentIntentId,
          paymentStatus,
          eventType,
        });
        return ack();
      }
      if (order.paymentStatus === 'refunded') {
        logWebhookEvent({
          orderId: order.id,
          paymentIntentId,
          paymentStatus,
          eventType,
        });
        return ack();
      }
      const chargeForIntent = getLatestCharge(paymentIntent as any);
      const cancellationReason =
        paymentIntent?.cancellation_reason ??
        paymentIntent?.status ??
        'canceled';
      const now = new Date();
      const createdAtIso = now.toISOString();
      const deltaMeta = buildPspMetadata({
        eventType,
        paymentIntent,
        charge: chargeForIntent,
      });
      const nextMeta = mergePspMetadata({
        prevMeta: order.pspMetadata,
        delta: deltaMeta as any,
        eventId: event.id,
        currency: order.currency,
        createdAtIso,
      });
      await guardedPaymentStatusUpdate({
        orderId: order.id,
        paymentProvider: 'stripe',
        to: 'failed',
        source: 'stripe_webhook',
        eventId: event.id,
        note: eventType,
        set: {
          updatedAt: now,
          pspChargeId: chargeForIntent?.id ?? null,
          pspPaymentMethod: resolvePaymentMethod(
            paymentIntent,
            chargeForIntent
          ),
          pspStatusReason: cancellationReason,
          pspMetadata: nextMeta,
        },
      });

      if (shouldRestockFromWebhook(order)) {
        await restockOrder(order.id, { reason: 'canceled' });
      }
      await markStripeAttemptFinal({
        paymentIntentId,
        status: 'canceled',
        errorCode: paymentIntent?.cancellation_reason ?? null,
        errorMessage: 'payment_intent_canceled',
      });
      logWebhookEvent({
        orderId: order.id,
        paymentIntentId,
        paymentStatus,
        eventType,
      });
      return ack();
    }

    if (
      eventType === 'charge.refunded' ||
      eventType === 'charge.refund.updated'
    ) {
      const refund = refundObject ?? charge?.refunds?.data?.[0] ?? null;

      const refundChargeId =
        refund && typeof refund.charge === 'string'
          ? refund.charge.trim().length > 0
            ? refund.charge
            : null
          : refund && typeof refund.charge === 'object' && refund.charge
          ? typeof (refund.charge as any).id === 'string'
            ? (refund.charge as any).id
            : null
          : null;

      // MVP: only FULL refund.
      let isFullRefund = false;

      if (eventType === 'charge.refunded') {
        const effectiveCharge = charge;

        const amt =
          typeof (effectiveCharge as any)?.amount === 'number'
            ? (effectiveCharge as any).amount
            : null;

        let cumulativeRefunded: number | null =
          typeof (effectiveCharge as any)?.amount_refunded === 'number'
            ? (effectiveCharge as any).amount_refunded
            : null;

        if (cumulativeRefunded == null) {
          const list = Array.isArray((effectiveCharge as any)?.refunds?.data)
            ? ((effectiveCharge as any).refunds.data as any[])
            : null;

          const currentAmt =
            typeof (refund as any)?.amount === 'number'
              ? (refund as any).amount
              : null;

          if (!list || list.length === 0) {
            warnRefundFullnessUndetermined({
              eventId: event.id,
              eventType,
              chargeId:
                ((effectiveCharge as any)?.id as string | undefined) ?? null,
              chargeAmount: amt,
              cumulativeRefunded: null,
              hasRefundObject: refund != null,
              refundsListLength: list ? list.length : null,
              hasAmountRefundedField:
                typeof (effectiveCharge as any)?.amount_refunded === 'number',
              reason: 'missing_amount_refunded_and_empty_refunds_list',
              orderId: order.id,
              paymentIntentId,
              refundId: refund?.id ?? null,
              refundAmount: currentAmt,
            });
            throwRefundFullnessUndetermined();
          }

          let sawNumericAmount = false;
          const sumFromList = list.reduce((sum, r) => {
            const a = typeof r?.amount === 'number' ? r.amount : null;
            if (a == null) return sum;
            sawNumericAmount = true;
            return sum + a;
          }, 0);

          if (!sawNumericAmount && currentAmt == null) {
            warnRefundFullnessUndetermined({
              eventId: event.id,
              eventType,
              chargeId:
                ((effectiveCharge as any)?.id as string | undefined) ?? null,
              chargeAmount: amt,
              cumulativeRefunded: null,
              hasRefundObject: refund != null,
              refundsListLength: list.length,
              hasAmountRefundedField:
                typeof (effectiveCharge as any)?.amount_refunded === 'number',
              reason:
                'refunds_list_has_no_numeric_amounts_and_event_has_no_refund_amount',
              orderId: order.id,
              paymentIntentId,
              refundId: refund?.id ?? null,
              refundAmount: currentAmt,
            });
            throwRefundFullnessUndetermined();
          }

          const hasCurrent =
            refund?.id && list.some(r => r?.id && r.id === refund.id);
          cumulativeRefunded = sumFromList + (hasCurrent ? 0 : currentAmt ?? 0);
        }

        if (amt == null || cumulativeRefunded == null) {
          const list = Array.isArray((effectiveCharge as any)?.refunds?.data)
            ? ((effectiveCharge as any).refunds.data as any[])
            : null;

          warnRefundFullnessUndetermined({
            eventId: event.id,
            eventType,
            chargeId:
              ((effectiveCharge as any)?.id as string | undefined) ?? null,
            chargeAmount: amt,
            cumulativeRefunded,
            hasRefundObject: refund != null,
            refundsListLength: list ? list.length : null,
            hasAmountRefundedField:
              typeof (effectiveCharge as any)?.amount_refunded === 'number',
            reason: 'missing_charge_amount_or_cumulative_refunded',
            orderId: order.id,
            paymentIntentId,
            refundId: refund?.id ?? null,
            refundAmount:
              typeof (refund as any)?.amount === 'number'
                ? (refund as any).amount
                : null,
          });
          throwRefundFullnessUndetermined();
        }

        isFullRefund = cumulativeRefunded === amt;
      } else if (eventType === 'charge.refund.updated' && refund) {
        let effectiveCharge: Stripe.Charge | undefined;

        if (typeof refund.charge === 'object' && refund.charge) {
          effectiveCharge = refund.charge as Stripe.Charge;
        } else if (typeof refund.charge === 'string' && refund.charge.trim()) {
          effectiveCharge = await retrieveCharge(refund.charge.trim());
        }

        const amt =
          typeof (effectiveCharge as any)?.amount === 'number'
            ? (effectiveCharge as any).amount
            : null;

        let cumulativeRefunded: number | null =
          typeof (effectiveCharge as any)?.amount_refunded === 'number'
            ? (effectiveCharge as any).amount_refunded
            : null;

        if (cumulativeRefunded == null) {
          const list = Array.isArray((effectiveCharge as any)?.refunds?.data)
            ? ((effectiveCharge as any).refunds.data as any[])
            : null;

          const currentAmt =
            typeof (refund as any)?.amount === 'number'
              ? (refund as any).amount
              : null;

          if (!list || list.length === 0) {
            warnRefundFullnessUndetermined({
              eventId: event.id,
              eventType,
              chargeId:
                ((effectiveCharge as any)?.id as string | undefined) ??
                refundChargeId ??
                null,
              chargeAmount: amt,
              cumulativeRefunded: null,
              hasRefundObject: true,
              refundsListLength: list ? list.length : null,
              hasAmountRefundedField:
                typeof (effectiveCharge as any)?.amount_refunded === 'number',
              reason: 'missing_amount_refunded_and_empty_refunds_list',
              orderId: order.id,
              paymentIntentId,
              refundId: refund.id,
              refundAmount: currentAmt,
            });
            throwRefundFullnessUndetermined();
          }

          let sawNumericAmount = false;
          const sumFromList = list.reduce((sum, r) => {
            const a = typeof r?.amount === 'number' ? r.amount : null;
            if (a == null) return sum;
            sawNumericAmount = true;
            return sum + a;
          }, 0);

          if (!sawNumericAmount && currentAmt == null) {
            warnRefundFullnessUndetermined({
              eventId: event.id,
              eventType,
              chargeId:
                ((effectiveCharge as any)?.id as string | undefined) ??
                refundChargeId ??
                null,
              chargeAmount: amt,
              cumulativeRefunded: null,
              hasRefundObject: true,
              refundsListLength: list.length,
              hasAmountRefundedField:
                typeof (effectiveCharge as any)?.amount_refunded === 'number',
              reason:
                'refunds_list_has_no_numeric_amounts_and_event_has_no_refund_amount',
              orderId: order.id,
              paymentIntentId,
              refundId: refund.id,
              refundAmount: currentAmt,
            });
            throwRefundFullnessUndetermined();
          }

          const hasCurrent = list.some(r => r?.id && r.id === refund.id);
          cumulativeRefunded = sumFromList + (hasCurrent ? 0 : currentAmt ?? 0);
        }

        if (amt == null || cumulativeRefunded == null) {
          const list = Array.isArray((effectiveCharge as any)?.refunds?.data)
            ? ((effectiveCharge as any).refunds.data as any[])
            : null;

          warnRefundFullnessUndetermined({
            eventId: event.id,
            eventType,
            chargeId:
              ((effectiveCharge as any)?.id as string | undefined) ??
              refundChargeId ??
              null,
            chargeAmount: amt,
            cumulativeRefunded,
            hasRefundObject: true,
            refundsListLength: list ? list.length : null,
            hasAmountRefundedField:
              typeof (effectiveCharge as any)?.amount_refunded === 'number',
            reason: 'missing_charge_amount_or_cumulative_refunded',
            orderId: order.id,
            paymentIntentId,
            refundId: refund.id,
            refundAmount:
              typeof (refund as any)?.amount === 'number'
                ? (refund as any).amount
                : null,
          });
          throwRefundFullnessUndetermined();
        }

        isFullRefund = cumulativeRefunded === amt;

        if (effectiveCharge?.id) {
          charge = effectiveCharge;
        }
      }

      const now = new Date();
      const createdAtIso = now.toISOString();

      if (!isFullRefund) {
        const deltaMeta = buildPspMetadata({
          eventType,
          paymentIntent,
          charge: charge ?? undefined,
          refund,
          extra: {
            refundGate: {
              decision: 'ignored',
              expectedAmountMinor: order.totalAmountMinor,
              chargeAmount: (charge as any)?.amount ?? null,
              chargeAmountRefunded: (charge as any)?.amount_refunded ?? null,
              refundAmount: (refund as any)?.amount ?? null,
              eventId: event.id,
            },
          },
        });

        const nextMeta = mergePspMetadata({
          prevMeta: order.pspMetadata,
          delta: deltaMeta as any,
          eventId: event.id,
          currency: order.currency,
          createdAtIso,
        });

        await db
          .update(orders)
          .set({
            updatedAt: now,
            pspMetadata: nextMeta,
            // do NOT change paymentStatus/status for partial refund
            pspChargeId: charge?.id ?? refundChargeId ?? null,
            pspPaymentMethod: resolvePaymentMethod(paymentIntent, charge),
            pspStatusReason: 'PARTIAL_REFUND_IGNORED',
          })
          .where(eq(orders.id, order.id));

        logWebhookEvent({
          orderId: order.id,
          paymentIntentId,
          paymentStatus,
          eventType,
        });
        return ack();
      }

      const deltaMeta = buildPspMetadata({
        eventType,
        paymentIntent,
        charge: charge ?? undefined,
        refund,
      });

      const nextMeta = mergePspMetadata({
        prevMeta: order.pspMetadata,
        delta: deltaMeta as any,
        eventId: event.id,
        currency: order.currency,
        createdAtIso,
      });

      const refundRes = await guardedPaymentStatusUpdate({
        orderId: order.id,
        paymentProvider: 'stripe',
        to: 'refunded',
        source: 'stripe_webhook',
        eventId: event.id,
        note: eventType,
        set: {
          updatedAt: now,
          status: 'CANCELED', // terminal in current enum
          pspChargeId: charge?.id ?? refundChargeId ?? null,
          pspPaymentMethod: resolvePaymentMethod(paymentIntent, charge),
          pspStatusReason: refund?.reason ?? refund?.status ?? 'refunded',
          pspMetadata: nextMeta,
        },
      });

      const canRestock =
        refundRes.applied ||
        (!refundRes.applied && refundRes.reason === 'ALREADY_IN_STATE');

      if (canRestock && shouldRestockFromWebhook(order)) {
        await restockOrder(order.id, { reason: 'refunded' });
      }

      logWebhookEvent({
        orderId: order.id,
        paymentIntentId,
        paymentStatus,
        eventType,
      });
      return ack();
    }

    // default ack
    logWebhookEvent({
      orderId: order.id,
      paymentIntentId,
      paymentStatus,
      eventType,
    });
    return ack();
  } catch (error) {
    if (isRefundFullnessUndeterminedError(error)) {
      // Do NOT ack() -> keep processedAt NULL so Stripe retries.
      return NextResponse.json(
        { code: REFUND_FULLNESS_UNDETERMINED },
        { status: 500 }
      );
    }

    logError('Stripe webhook processing failed', error);
    // P0.8: release claim early so Stripe retries can be claimed immediately.
    try {
      await db
        .update(stripeEvents)
        .set({ claimExpiresAt: new Date(0) })
        .where(
          and(
            eq(stripeEvents.eventId, event.id),
            eq(stripeEvents.claimedBy, STRIPE_WEBHOOK_INSTANCE_ID),
            isNull(stripeEvents.processedAt)
          )
        );
    } catch {
      // best-effort
    }
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
