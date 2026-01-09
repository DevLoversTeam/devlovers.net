// app/api/webhooks/stripe/route.ts
import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, ne, or } from 'drizzle-orm';
import { db } from '@/db';
import { verifyWebhookSignature, retrieveCharge } from '@/lib/psp/stripe';
import { orders, stripeEvents } from '@/db/schema';
import { restockOrder } from '@/lib/services/orders';
import { logError } from '@/lib/logging';

function logWebhookEvent(payload: {
  orderId?: string;
  paymentIntentId?: string | null;
  paymentStatus?: string | null;
  eventType: string;
}) {
  const { orderId, paymentIntentId, paymentStatus, eventType } = payload;

  console.log('stripe_webhook', {
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
      await db
        .update(stripeEvents)
        .set({ processedAt: new Date() })
        .where(eq(stripeEvents.eventId, event.id));
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
        console.log('stripe_webhook_duplicate_event', {
          eventId: event.id,
          eventType,
        });
        return NextResponse.json({ received: true }, { status: 200 });
      }
      // processedAt is NULL => previous attempt failed; reprocess
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
        console.log('stripe_webhook_missing_order_id', {
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
      })
      .from(orders)
      .where(eq(orders.id, resolvedOrderId))
      .limit(1);

    if (!order) {
      logWebhookEvent({ eventType, paymentIntentId, paymentStatus });
      return ack();
    }

    if (order.paymentIntentId && order.paymentIntentId !== paymentIntentId) {
      console.log('stripe_webhook_payment_intent_mismatch', {
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

        await db
          .update(orders)
          .set({
            updatedAt: new Date(),
            pspStatusReason: mismatchReason,
            pspMetadata: buildPspMetadata({
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
                  actual: {
                    amountMinor: stripeAmount,
                    currency: stripeCurrency,
                  },

                  // keep old fields for backward-compat/debug grepping
                  stripeAmount,
                  orderAmountMinor,
                  stripeCurrency,
                  orderCurrency: order.currency,
                },
              },
            }),
          })
          .where(eq(orders.id, order.id));

        console.log('stripe_webhook_mismatch', {
          orderId: order.id,
          paymentIntentId,
          eventType,
          stripeAmount,
          orderAmountMinor,
          stripeCurrency,
          orderCurrency: order.currency,
          reason: mismatchReason,
        });

        return ack();
      }

      const chargeForIntent = getLatestCharge(paymentIntent as any);
      const latestChargeId = getLatestChargeId(paymentIntent);

      const updated = await db
        .update(orders)
        .set({
          status: 'PAID',
          paymentStatus: 'paid',
          updatedAt: new Date(),
          pspChargeId: latestChargeId ?? chargeForIntent?.id ?? null,
          pspPaymentMethod: resolvePaymentMethod(
            paymentIntent,
            chargeForIntent
          ),
          pspStatusReason: paymentIntent?.status ?? 'succeeded',
          pspMetadata: buildPspMetadata({
            eventType,
            paymentIntent,
            charge: chargeForIntent ?? undefined,
          }),
        })
        .where(
          and(
            eq(orders.id, order.id),
            eq(orders.stockRestored, false),
            ne(orders.inventoryStatus, 'released'),

            // allow "repair": if already paid but status != PAID, still update
            or(ne(orders.paymentStatus, 'paid'), ne(orders.status, 'PAID')),

            // keep safety gates
            ne(orders.paymentStatus, 'failed'),
            ne(orders.paymentStatus, 'refunded')
          )
        )

        .returning({ id: orders.id });

      // if returning empty => we did NOT "win" the right to mark paid; do nothing
      if (updated.length === 0) {
        // REPAIR: paid already, but status is inconsistent
        await db
          .update(orders)
          .set({
            status: 'PAID',
            updatedAt: new Date(),
            pspChargeId: latestChargeId ?? chargeForIntent?.id ?? null,
            pspPaymentMethod: resolvePaymentMethod(
              paymentIntent,
              chargeForIntent
            ),
            pspStatusReason: paymentIntent?.status ?? 'succeeded',
            pspMetadata: buildPspMetadata({
              eventType,
              paymentIntent,
              charge: chargeForIntent ?? undefined,
            }),
          })
          .where(
            and(
              eq(orders.id, order.id),
              eq(orders.paymentStatus, 'paid'),
              ne(orders.status, 'PAID'),
              eq(orders.stockRestored, false),
              ne(orders.inventoryStatus, 'released')
            )
          );

        logWebhookEvent({
          orderId: order.id,
          paymentIntentId,
          paymentStatus,
          eventType,
        });
        return ack();
      }

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

      const chargeForIntent = getLatestCharge(paymentIntent as any);
      const failureReason =
        paymentIntent?.last_payment_error?.decline_code ??
        paymentIntent?.last_payment_error?.code ??
        paymentIntent?.cancellation_reason ??
        paymentIntent?.status ??
        'payment_failed';

      const updated = await db
        .update(orders)
        .set({
          paymentStatus: 'failed',
          updatedAt: new Date(),
          pspChargeId: chargeForIntent?.id ?? null,
          pspPaymentMethod: resolvePaymentMethod(
            paymentIntent,
            chargeForIntent
          ),
          pspStatusReason: failureReason,
          pspMetadata: buildPspMetadata({
            eventType,
            paymentIntent,
            charge: chargeForIntent,
          }),
        })
        .where(and(eq(orders.id, order.id), ne(orders.paymentStatus, 'failed')))
        .returning({ id: orders.id });

      if (updated.length > 0) {
        await restockOrder(order.id, { reason: 'failed' });
      }

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

      const chargeForIntent = getLatestCharge(paymentIntent as any);
      const cancellationReason =
        paymentIntent?.cancellation_reason ??
        paymentIntent?.status ??
        'canceled';

      const updated = await db
        .update(orders)
        .set({
          paymentStatus: 'failed',
          updatedAt: new Date(),
          pspChargeId: chargeForIntent?.id ?? null,
          pspPaymentMethod: resolvePaymentMethod(
            paymentIntent,
            chargeForIntent
          ),
          pspStatusReason: cancellationReason,
          pspMetadata: buildPspMetadata({
            eventType,
            paymentIntent,
            charge: chargeForIntent,
          }),
        })
        .where(and(eq(orders.id, order.id), ne(orders.paymentStatus, 'failed')))
        .returning({ id: orders.id });

      if (updated.length > 0) {
        await restockOrder(order.id, { reason: 'canceled' });
      }

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
      // - charge.refunded: amount_refunded === amount
      // - charge.refund.updated: compare cumulative refunded for the charge vs charge.amount
      let isFullRefund = false;

      if (eventType === 'charge.refunded') {
        const effectiveCharge = charge;
        const amt =
          typeof (effectiveCharge as any)?.amount === 'number'
            ? (effectiveCharge as any).amount
            : null;
        const refunded =
          typeof (effectiveCharge as any)?.amount_refunded === 'number'
            ? (effectiveCharge as any).amount_refunded
            : null;

        isFullRefund = amt != null && refunded != null && refunded === amt;
      } else if (eventType === 'charge.refund.updated' && refund) {
        // Ensure we have the Charge to compute cumulative refunded correctly.
        let effectiveCharge: Stripe.Charge | undefined;

        if (typeof refund.charge === 'object' && refund.charge) {
          effectiveCharge = refund.charge as Stripe.Charge;
        } else if (typeof refund.charge === 'string' && refund.charge.trim()) {
          // Critical: fetch charge to get full refunds list
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

        // Fallback: sum refunds list if present; include current refund if not in list yet
        if (
          cumulativeRefunded == null &&
          Array.isArray((effectiveCharge as any)?.refunds?.data)
        ) {
          const list = (effectiveCharge as any).refunds.data as any[];
          const sumFromList = list.reduce((sum, r) => {
            const a = typeof r?.amount === 'number' ? r.amount : 0;
            return sum + a;
          }, 0);

          const currentAmt =
            typeof (refund as any).amount === 'number'
              ? (refund as any).amount
              : 0;

          const hasCurrent = list.some(r => r?.id && r.id === refund.id);

          cumulativeRefunded = sumFromList + (hasCurrent ? 0 : currentAmt);
        }

        // If still unknown -> fail to force retry (better than silently ignoring full refund)
        if (amt == null || cumulativeRefunded == null) {
          throw new Error('REFUND_FULLNESS_UNDETERMINED');
        }

        isFullRefund = cumulativeRefunded === amt;

        // Prefer charge id from effectiveCharge for PSP fields
        if (effectiveCharge?.id) {
          // override local charge variable for downstream pspChargeId/metadata usage
          charge = effectiveCharge;
        }
      }

      if (!isFullRefund) {
        await db
          .update(orders)
          .set({
            updatedAt: new Date(),
            // do NOT change paymentStatus/status for partial refund
            pspChargeId: charge?.id ?? refundChargeId ?? null,
            pspPaymentMethod: resolvePaymentMethod(paymentIntent, charge),
            pspStatusReason: 'PARTIAL_REFUND_IGNORED',
            pspMetadata: buildPspMetadata({
              eventType,
              paymentIntent,
              charge: charge ?? undefined,
              refund,
              extra: {
                refundGate: {
                  decision: 'ignored',
                  expectedAmountMinor: order.totalAmountMinor,
                  chargeAmount: (charge as any)?.amount ?? null,
                  chargeAmountRefunded:
                    (charge as any)?.amount_refunded ?? null,
                  refundAmount: (refund as any)?.amount ?? null,
                  eventId: event.id,
                },
              },
            }),
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

      await db
        .update(orders)
        .set({
          updatedAt: new Date(),
          paymentStatus: 'refunded',
          status: 'CANCELED', // terminal in current enum
          pspChargeId: charge?.id ?? refundChargeId ?? null,
          pspPaymentMethod: resolvePaymentMethod(paymentIntent, charge),
          pspStatusReason: refund?.reason ?? refund?.status ?? 'refunded',
          pspMetadata: buildPspMetadata({
            eventType,
            paymentIntent,
            charge: charge ?? undefined,
            refund,
          }),
        })
        .where(
          and(eq(orders.id, order.id), ne(orders.paymentStatus, 'refunded'))
        );

      await restockOrder(order.id, { reason: 'refunded' });

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
    logError('Stripe webhook processing failed', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
