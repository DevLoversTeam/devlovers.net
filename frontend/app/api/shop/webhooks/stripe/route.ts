// app/api/webhooks/stripe/route.ts
import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { verifyWebhookSignature } from '@/lib/psp/stripe';
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
    return NextResponse.json({ error: 'missing_signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = verifyWebhookSignature({ rawBody, signatureHeader: signature });
  } catch (error) {
    if (error instanceof Error && error.message === 'STRIPE_WEBHOOK_DISABLED') {
      logError('Stripe webhook disabled or misconfigured', error);
      return NextResponse.json({ error: 'WEBHOOK_DISABLED' }, { status: 500 });
    }

    if (
      error instanceof Error &&
      error.message === 'STRIPE_INVALID_SIGNATURE'
    ) {
      logError('Stripe webhook signature verification failed', error);
      return NextResponse.json({ error: 'INVALID_SIGNATURE' }, { status: 400 });
    }

    logError('Stripe webhook signature verification failed', error);
    throw error;
  }

  const eventType = event.type;
  const rawObject = event.data.object;

  let paymentIntent: Stripe.PaymentIntent | undefined;
  let charge: Stripe.Charge | undefined;

  if (eventType.startsWith('payment_intent.')) {
    paymentIntent = rawObject as Stripe.PaymentIntent;
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
      typeof pi.id === 'string'
    ) {
      paymentIntentId = pi.id;
    }
  }

  const paymentStatus: string | null =
    (paymentIntent?.status as string | null | undefined) ??
    (charge?.status as string | null | undefined) ??
    null;

  const rawMetadata =
    rawObject && typeof rawObject === 'object' && 'metadata' in rawObject
      ? (rawObject as { metadata?: Stripe.Metadata }).metadata
      : undefined;

  const metadata: Stripe.Metadata | undefined =
    paymentIntent?.metadata ?? charge?.metadata ?? rawMetadata;

  const orderId =
    typeof metadata?.orderId === 'string' && metadata.orderId.trim().length > 0
      ? metadata.orderId
      : undefined;

  if (!paymentIntentId) {
    logWebhookEvent({ eventType, paymentIntentId, paymentStatus });
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const isUniqueConstraintError = (error: unknown) =>
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === '23505';

  try {
    const response = await db.transaction(async tx => {
      try {
        await tx.insert(stripeEvents).values({
          provider: 'stripe',
          eventId: event.id,
          paymentIntentId,
          orderId: orderId ?? null,
          eventType,
          paymentStatus,
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          console.log('stripe_webhook_duplicate_event', {
            eventId: event.id,
            eventType,
          });

          return NextResponse.json({ received: true }, { status: 200 });
        }

        throw error;
      }

      let order:
        | {
            id: string;
            paymentIntentId: string | null;
            totalAmountMinor: number;
            currency: string;
          }
        | undefined;

      if (orderId) {
        const [foundOrder] = await tx
          .select({
            id: orders.id,
            paymentIntentId: orders.paymentIntentId,
            totalAmountMinor: orders.totalAmountMinor,
            currency: orders.currency,
          })

          .from(orders)
          .where(eq(orders.id, orderId))
          .limit(1);

        if (foundOrder) {
          order = {
            id: foundOrder.id,
            paymentIntentId: foundOrder.paymentIntentId,
            totalAmountMinor: foundOrder.totalAmountMinor,
            currency: foundOrder.currency,
          };
        }
      }

      if (!orderId) {
        console.log('stripe_webhook_missing_order_id', {
          paymentIntentId,
          eventType,
          reason: 'missing_order_id_metadata',
        });

        return NextResponse.json({ received: true }, { status: 200 });
      }

      if (!order) {
        logWebhookEvent({ eventType, paymentIntentId, paymentStatus });
        return NextResponse.json({ received: true }, { status: 200 });
      }

      if (order.paymentIntentId && order.paymentIntentId !== paymentIntentId) {
        console.log('stripe_webhook_payment_intent_mismatch', {
          orderId: order.id,
          paymentIntentId,
          orderPaymentIntentId: order.paymentIntentId,
          eventType,
          reason: 'payment_intent_mismatch',
        });

        return NextResponse.json({ received: true }, { status: 200 });
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

          const chargeForIntent = getLatestCharge(paymentIntent);

          await tx
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

          return NextResponse.json({ received: true }, { status: 200 });
        }

        const chargeForIntent = getLatestCharge(paymentIntent);

        await tx
          .update(orders)
          .set({
            paymentStatus: 'paid',
            updatedAt: new Date(),
            pspChargeId: chargeForIntent?.id ?? null,
            pspPaymentMethod: resolvePaymentMethod(
              paymentIntent,
              chargeForIntent
            ),
            pspStatusReason: null,
            pspMetadata: buildPspMetadata({
              eventType,
              paymentIntent,
              charge: chargeForIntent,
            }),
          })
          .where(eq(orders.id, order.id));
      } else if (eventType === 'payment_intent.payment_failed') {
        const chargeForIntent = getLatestCharge(paymentIntent);
        const failureReason =
          paymentIntent?.last_payment_error?.decline_code ??
          paymentIntent?.last_payment_error?.code ??
          paymentIntent?.cancellation_reason ??
          paymentIntent?.status ??
          'payment_failed';

        await tx
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
          .where(eq(orders.id, order.id));

        await restockOrder(order.id, { reason: 'failed' });
      } else if (eventType === 'payment_intent.canceled') {
        const chargeForIntent = getLatestCharge(paymentIntent);
        const cancellationReason =
          paymentIntent?.cancellation_reason ??
          paymentIntent?.status ??
          'canceled';

        await tx
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
          .where(eq(orders.id, order.id));

        await restockOrder(order.id, { reason: 'canceled' });
      } else if (
        eventType === 'charge.refunded' ||
        eventType === 'charge.refund.updated'
      ) {
        const refund = charge?.refunds?.data?.[0] ?? null;

        await tx
          .update(orders)
          .set({
            updatedAt: new Date(),
            pspChargeId: charge?.id ?? null,
            pspPaymentMethod: resolvePaymentMethod(paymentIntent, charge),
            pspStatusReason: refund?.reason ?? refund?.status ?? 'refunded',
            pspMetadata: buildPspMetadata({
              eventType,
              paymentIntent,
              charge: charge ?? undefined,
              refund,
            }),
          })
          .where(eq(orders.id, order.id));

        await restockOrder(order.id, { reason: 'refunded' });
      } else {
        logWebhookEvent({
          orderId: order.id,
          paymentIntentId,
          paymentStatus,
          eventType,
        });
        return NextResponse.json({ received: true }, { status: 200 });
      }
      logWebhookEvent({
        orderId: order.id,
        paymentIntentId,
        paymentStatus,
        eventType,
      });
      return NextResponse.json({ received: true }, { status: 200 });
    });

    return response;
  } catch (error) {
    logError('Stripe webhook processing failed', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
