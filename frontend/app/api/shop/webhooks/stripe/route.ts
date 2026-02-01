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
  getRateLimitSubject,
  rateLimitResponse,
} from '@/lib/security/rate-limit';
import { resolveStripeWebhookRateLimit } from '@/lib/security/stripe-webhook-rate-limit';
import { guardNonBrowserOnly } from '@/lib/security/origin';

const REFUND_FULLNESS_UNDETERMINED = 'REFUND_FULLNESS_UNDETERMINED' as const;

const STRIPE_WEBHOOK_INSTANCE_ID =
  (
    process.env.STRIPE_WEBHOOK_INSTANCE_ID ??
    process.env.WEBHOOK_INSTANCE_ID ??
    ''
  ).trim() || crypto.randomUUID().slice(0, 12);

const STRIPE_EVENT_CLAIM_TTL_MS = 10 * 60 * 1000;
const STRIPE_EVENT_RETRY_AFTER_SECONDS = 10;

function noStoreJson(
  body: unknown,
  init?: { status?: number; headers?: HeadersInit }
) {
  const res = NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: init?.headers,
  });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

function busyRetry() {
  const res = noStoreJson(
    {
      code: 'WEBHOOK_CLAIMED',
      retryAfterSeconds: STRIPE_EVENT_RETRY_AFTER_SECONDS,
    },
    {
      status: 503,
      headers: { 'Retry-After': String(STRIPE_EVENT_RETRY_AFTER_SECONDS) },
    }
  );
  return res;
}

export function OPTIONS(request: NextRequest) {
  const blocked = guardNonBrowserOnly(request);
  if (blocked) {
    blocked.headers.set('Cache-Control', 'no-store');
    return blocked;
  }

  return noStoreJson(
    { error: 'METHOD_NOT_ALLOWED', code: 'METHOD_NOT_ALLOWED' },
    { status: 405, headers: { Allow: 'POST' } }
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
  requestId?: string;
  route?: string;
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
  logWarn('stripe_webhook_refund_fullness_undetermined', {
    ...payload,
    stripeEventId: payload.eventId,
    instanceId: STRIPE_WEBHOOK_INSTANCE_ID,
    provider: 'stripe',
    code: 'REFUND_FULLNESS_UNDETERMINED',
  });
}

function logWebhookEvent(payload: {
  requestId?: string;
  stripeEventId?: string;
  orderId?: string;
  paymentIntentId?: string | null;
  paymentStatus?: string | null;
  eventType: string;
  chargeId?: string | null;
  refundId?: string | null;
}) {
  const {
    requestId,
    stripeEventId,
    orderId,
    paymentIntentId,
    paymentStatus,
    eventType,
    chargeId,
    refundId,
  } = payload;

  const providerRef = refundId ?? chargeId ?? paymentIntentId ?? null;

  const providerRefType =
    refundId != null
      ? 'refund'
      : chargeId != null
        ? 'charge'
        : paymentIntentId != null
          ? 'payment_intent'
          : null;

  logInfo('stripe_webhook', {
    requestId,
    stripeEventId,
    provider: 'stripe',
    instanceId: STRIPE_WEBHOOK_INSTANCE_ID,

    orderId,
    paymentIntentId,
    chargeId: chargeId ?? null,
    refundId: refundId ?? null,

    providerRef,
    providerRefType,

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

function extractStripeId(value: unknown): string | null {
  if (typeof value === 'string') {
    const s = value.trim();
    return s.length > 0 ? s : null;
  }
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as any).id;
    if (typeof id === 'string') {
      const s = id.trim();
      return s.length > 0 ? s : null;
    }
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
  if (order.stockRestored === true) return false;
  if (order.inventoryStatus === 'released') return false;
  return true;
}

export async function POST(request: NextRequest) {
  const startedAtMs = Date.now();

  const requestId =
    request.headers.get('x-request-id')?.trim() || crypto.randomUUID();

  const baseMeta = {
    requestId,
    route: request.nextUrl.pathname,
    method: request.method,
    provider: 'stripe',
    instanceId: STRIPE_WEBHOOK_INSTANCE_ID,
  };

  const meta = (extra: Record<string, unknown> = {}) => ({
    ...baseMeta,
    ...extra,
    durationMs: Date.now() - startedAtMs,
  });

  const blocked = guardNonBrowserOnly(request);
  if (blocked) {
    logWarn('stripe_webhook_origin_blocked', meta({ code: 'ORIGIN_BLOCKED' }));
    blocked.headers.set('Cache-Control', 'no-store');
    return blocked;
  }

  let rawBody: string;

  try {
    rawBody = await request.text();
  } catch (error) {
    logError(
      'stripe_webhook_body_read_failed',
      error,
      meta({ code: 'INVALID_PAYLOAD' })
    );
    const res = noStoreJson(
      { error: 'invalid_payload', code: 'INVALID_PAYLOAD' },
      { status: 400 }
    );
    return res;
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    const subject = getRateLimitSubject(request);
    const rateLimit = resolveStripeWebhookRateLimit('missing_sig');
    const decision = await enforceRateLimit({
      key: `stripe_webhook:missing_sig:${subject}`,
      limit: rateLimit.max,
      windowSeconds: rateLimit.windowSeconds,
    });

    if (!decision.ok) {
      logWarn('stripe_webhook_rate_limited', {
        ...meta(),
        code: 'RATE_LIMITED',
        reason: 'missing_signature',
        retryAfterSeconds: decision.retryAfterSeconds,
      });

      const res = rateLimitResponse({
        retryAfterSeconds: decision.retryAfterSeconds,
        details: { scope: 'stripe_webhook', reason: 'missing_signature' },
      });
      return res;
    }

    logError(
      'stripe_webhook_missing_signature',
      new Error('MISSING_STRIPE_SIGNATURE'),
      meta({ code: 'MISSING_SIGNATURE' })
    );

    return noStoreJson({ code: 'INVALID_SIGNATURE' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = verifyWebhookSignature({ rawBody, signatureHeader: signature });
  } catch (error) {
    if (error instanceof Error && error.message === 'STRIPE_WEBHOOK_DISABLED') {
      logError('stripe_webhook_disabled_or_misconfigured', error, {
        ...meta(),
        code: 'WEBHOOK_DISABLED',
      });

      return noStoreJson({ code: 'WEBHOOK_DISABLED' }, { status: 500 });
    }

    if (
      error instanceof Error &&
      error.message === 'STRIPE_INVALID_SIGNATURE'
    ) {
      const subject = getRateLimitSubject(request);
      const rateLimit = resolveStripeWebhookRateLimit('invalid_sig');
      const decision = await enforceRateLimit({
        key: `stripe_webhook:invalid_sig:${subject}`,
        limit: rateLimit.max,
        windowSeconds: rateLimit.windowSeconds,
      });

      if (!decision.ok) {
        logWarn('stripe_webhook_rate_limited', {
          ...meta(),
          code: 'RATE_LIMITED',
          reason: 'invalid_signature',
          retryAfterSeconds: decision.retryAfterSeconds,
        });

        const res = rateLimitResponse({
          retryAfterSeconds: decision.retryAfterSeconds,
          details: { scope: 'stripe_webhook', reason: 'invalid_signature' },
        });
        return res;
      }

      logError('stripe_webhook_signature_verification_failed', error, {
        ...meta(),
        code: 'INVALID_SIGNATURE',
      });

      return noStoreJson({ code: 'INVALID_SIGNATURE' }, { status: 400 });
    }

    logError(
      'stripe_webhook_signature_verification_unexpected_error',
      error,
      meta({ code: 'SIGNATURE_VERIFICATION_FAILED' })
    );

    const res = noStoreJson(
      { error: 'internal_error', code: 'SIGNATURE_VERIFICATION_FAILED' },
      { status: 500 }
    );
    return res;
  }

  const eventType = event.type;
  const stripeEventId = event.id;
  const eventMeta = (extra: Record<string, unknown> = {}) =>
    meta({ stripeEventId, eventType, ...extra });

  const warnBase = { requestId, route: baseMeta.route };
  const rawObject = event.data.object;

  let paymentIntent: Stripe.PaymentIntent | undefined;
  let charge: Stripe.Charge | undefined;
  let refundObject: Stripe.Refund | undefined;

  if (eventType.startsWith('payment_intent.')) {
    paymentIntent = rawObject as Stripe.PaymentIntent;
  } else if (eventType === 'charge.refund.updated') {
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

  const bestEffortRefundChargeId: string | null = extractStripeId(
    (refundObject as any)?.charge
  );

  const bestEffortChargeId: string | null = paymentIntent
    ? getLatestChargeId(paymentIntent)
    : (charge?.id ?? bestEffortRefundChargeId ?? null);

  const bestEffortRefundId: string | null = refundObject?.id ?? null;

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
    logWebhookEvent({
      eventType,
      paymentIntentId,
      paymentStatus,
      chargeId: bestEffortChargeId,
      refundId: bestEffortRefundId,
      requestId,
      stripeEventId,
    });
    return noStoreJson({ received: true }, { status: 200 });
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
          ...eventMeta(),
          eventId: event.id,
          code: 'WEBHOOK_CLAIM_LOST',
        });

        return busyRetry();
      }

      return noStoreJson({ received: true }, { status: 200 });
    };
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
          ...eventMeta(),
          eventId: event.id,
        });

        return noStoreJson({ received: true }, { status: 200 });
      }
    }

    const claimState = await tryClaimStripeEvent(event.id);
    if (claimState === 'already_processed') {
      logInfo('stripe_webhook_duplicate_event', {
        ...eventMeta(),
        eventId: event.id,
        reason: 'already_processed',
      });

      return noStoreJson({ received: true }, { status: 200 });
    }
    if (claimState === 'busy') {
      logInfo('stripe_webhook_claimed_by_other_instance', {
        ...eventMeta(),
        eventId: event.id,
      });
      return busyRetry();
    }

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
          ...eventMeta(),
          code: 'MISSING_ORDER_ID',
          paymentIntentId,
          chargeId: bestEffortChargeId,
          refundId: bestEffortRefundId,
          reason:
            candidates.length === 0
              ? 'no_order_for_payment_intent'
              : 'multiple_orders_for_payment_intent',
        });

        logWebhookEvent({
          requestId,
          stripeEventId,
          eventType,
          paymentIntentId,
          paymentStatus,
          chargeId: bestEffortChargeId,
          refundId: bestEffortRefundId,
        });

        return ack();
      }
    }

    if (resolvedOrderId && !orderId) {
      await db
        .update(stripeEvents)
        .set({ orderId: resolvedOrderId })
        .where(eq(stripeEvents.eventId, event.id));
    }

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
      logWebhookEvent({
        eventType,
        paymentIntentId,
        paymentStatus,
        chargeId: bestEffortChargeId,
        refundId: bestEffortRefundId,
        requestId,
        stripeEventId,
      });
      return ack();
    }

    if (order.paymentIntentId && order.paymentIntentId !== paymentIntentId) {
      logInfo('stripe_webhook_payment_intent_mismatch', {
        ...eventMeta(),
        code: 'PAYMENT_INTENT_MISMATCH',
        orderId: order.id,
        paymentIntentId,
        orderPaymentIntentId: order.paymentIntentId,
        chargeId: bestEffortChargeId,
        refundId: bestEffortRefundId,
        reason: 'payment_intent_mismatch',
      });

      return ack();
    }

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
        const latestChargeId = getLatestChargeId(paymentIntent);
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
          ...eventMeta(),
          code: 'PSP_MISMATCH',
          orderId: order.id,
          paymentIntentId,
          stripeAmount,
          orderAmountMinor,
          stripeCurrency,
          orderCurrency: order.currency,
          reason: mismatchReason,
          chargeId: latestChargeId ?? chargeForIntent?.id ?? null,
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
          or(isNull(orders.stockRestored), eq(orders.stockRestored, false)),
          or(
            isNull(orders.inventoryStatus),
            ne(orders.inventoryStatus, 'released')
          ),
          or(ne(orders.paymentStatus, 'paid'), ne(orders.status, 'PAID')),
          ne(orders.paymentStatus, 'failed'),
          ne(orders.paymentStatus, 'refunded')
        ),
      });
      await markStripeAttemptFinal({
        paymentIntentId,
        status: 'succeeded',
      });

      logWebhookEvent({
        requestId,
        stripeEventId,
        orderId: order.id,
        paymentIntentId,
        paymentStatus,
        eventType,
        chargeId: latestChargeId ?? chargeForIntent?.id ?? null,
      });

      return ack();
    }
    if (eventType === 'payment_intent.payment_failed') {
      const chargeForIntent = getLatestCharge(paymentIntent as any);
      const latestChargeId = getLatestChargeId(paymentIntent);

      if (order.paymentStatus === 'paid') {
        logWebhookEvent({
          orderId: order.id,
          paymentIntentId,
          paymentStatus,
          eventType,
          chargeId: latestChargeId ?? chargeForIntent?.id ?? null,
          requestId,
          stripeEventId,
        });
        return ack();
      }
      if (order.paymentStatus === 'refunded') {
        logWebhookEvent({
          orderId: order.id,
          paymentIntentId,
          paymentStatus,
          eventType,
          chargeId: latestChargeId ?? chargeForIntent?.id ?? null,
          requestId,
          stripeEventId,
        });
        return ack();
      }

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
          pspChargeId: latestChargeId ?? chargeForIntent?.id ?? null,
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
        chargeId: latestChargeId ?? chargeForIntent?.id ?? null,
        requestId,
        stripeEventId,
      });
      return ack();
    }

    if (eventType === 'payment_intent.canceled') {
      const chargeForIntent = getLatestCharge(paymentIntent as any);
      const latestChargeId = getLatestChargeId(paymentIntent);

      if (order.paymentStatus === 'paid') {
        logWebhookEvent({
          orderId: order.id,
          paymentIntentId,
          paymentStatus,
          eventType,
          chargeId: latestChargeId ?? chargeForIntent?.id ?? null,
          requestId,
          stripeEventId,
        });
        return ack();
      }
      if (order.paymentStatus === 'refunded') {
        logWebhookEvent({
          orderId: order.id,
          paymentIntentId,
          paymentStatus,
          eventType,
          chargeId: latestChargeId ?? chargeForIntent?.id ?? null,
          requestId,
          stripeEventId,
        });
        return ack();
      }
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
          pspChargeId: latestChargeId ?? chargeForIntent?.id ?? null,
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
        chargeId: latestChargeId ?? chargeForIntent?.id ?? null,
        requestId,
        stripeEventId,
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
              ...warnBase,
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
              ...warnBase,
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
          cumulativeRefunded =
            sumFromList + (hasCurrent ? 0 : (currentAmt ?? 0));
        }

        if (amt == null || cumulativeRefunded == null) {
          const list = Array.isArray((effectiveCharge as any)?.refunds?.data)
            ? ((effectiveCharge as any).refunds.data as any[])
            : null;

          warnRefundFullnessUndetermined({
            ...warnBase,
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
              ...warnBase,
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
              ...warnBase,
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
          cumulativeRefunded =
            sumFromList + (hasCurrent ? 0 : (currentAmt ?? 0));
        }

        if (amt == null || cumulativeRefunded == null) {
          const list = Array.isArray((effectiveCharge as any)?.refunds?.data)
            ? ((effectiveCharge as any).refunds.data as any[])
            : null;

          warnRefundFullnessUndetermined({
            ...warnBase,
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
            pspChargeId: charge?.id ?? refundChargeId ?? null,
            pspPaymentMethod: resolvePaymentMethod(paymentIntent, charge),
            pspStatusReason: 'PARTIAL_REFUND_IGNORED',
          })
          .where(eq(orders.id, order.id));

        logWebhookEvent({
          requestId,
          stripeEventId,
          orderId: order.id,
          paymentIntentId,
          paymentStatus,
          eventType,
          refundId: refund?.id ?? null,
          chargeId: charge?.id ?? refundChargeId ?? null,
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
          status: 'CANCELED',
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
        requestId,
        stripeEventId,
        orderId: order.id,
        paymentIntentId,
        paymentStatus,
        eventType,
        refundId: refund?.id ?? null,
        chargeId: charge?.id ?? refundChargeId ?? null,
      });

      return ack();
    }

    logWebhookEvent({
      requestId,
      stripeEventId,
      orderId: order.id,
      paymentIntentId,
      paymentStatus,
      eventType,
      chargeId: charge?.id ?? null,
      refundId: refundObject?.id ?? null,
    });

    return ack();
  } catch (error) {
    if (isRefundFullnessUndeterminedError(error)) {
      return noStoreJson(
        { code: REFUND_FULLNESS_UNDETERMINED },
        { status: 500 }
      );
    }

    logError('stripe_webhook_processing_failed', error, {
      ...eventMeta(),
      code: 'WEBHOOK_PROCESSING_FAILED',
      paymentIntentId,
      orderId: orderId ?? null,
    });

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
    return noStoreJson({ error: 'internal_error' }, { status: 500 });
  }
}
