import Stripe from 'stripe';
import { getStripeEnv } from '@/lib/env/stripe';
import { logError } from '@/lib/logging';

type CreatePaymentIntentInput = {
  amount: number;
  currency: string;
  orderId: string;
  idempotencyKey?: string;
};

type CreateRefundInput = {
  orderId: string;
  paymentIntentId?: string | null;
  chargeId?: string | null;
  amountMinor?: number; // full refund: pass totalAmountMinor (recommended)
  idempotencyKey?: string;
};

let _stripe: Stripe | null = null;
let _stripeKey: string | null = null;

export async function createRefund({
  orderId,
  paymentIntentId,
  chargeId,
  amountMinor,
  idempotencyKey,
}: CreateRefundInput): Promise<{
  refundId: string;
  status: Stripe.Refund['status'];
}> {
  const { paymentsEnabled, mode } = getStripeEnv();
  const stripe = getStripeClient();

  if (!paymentsEnabled || !stripe) {
    throw new Error('STRIPE_DISABLED');
  }

  const pi = paymentIntentId?.trim() ? paymentIntentId.trim() : null;
  const ch = chargeId?.trim() ? chargeId.trim() : null;

  if (!pi && !ch) {
    throw new Error('STRIPE_REFUND_MISSING_TARGET');
  }

  if (amountMinor !== undefined) {
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
      throw new Error('STRIPE_INVALID_REFUND_AMOUNT');
    }
  }

  try {
    const refund = await stripe.refunds.create(
      {
        ...(pi ? { payment_intent: pi } : { charge: ch! }),
        ...(amountMinor !== undefined ? { amount: amountMinor } : {}),
        metadata: { orderId, mode: mode ?? 'test' },
      },
      idempotencyKey ? { idempotencyKey } : undefined
    );

    return { refundId: refund.id, status: refund.status };
  } catch (error) {
    logError('Stripe refund creation failed', error);
    throw new Error('STRIPE_REFUND_FAILED');
  }
}

function getStripeClient(): Stripe | null {
  const { secretKey } = getStripeEnv();
  if (!secretKey) return null;

  if (_stripe && _stripeKey === secretKey) return _stripe;
  _stripeKey = secretKey;

  _stripe = new Stripe(secretKey, {
    apiVersion: '2025-11-17.clover',
  });

  return _stripe;
}

export async function createPaymentIntent({
  amount,
  currency,
  orderId,
  idempotencyKey,
}: CreatePaymentIntentInput): Promise<{
  clientSecret: string;
  paymentIntentId: string;
}> {
  const { paymentsEnabled, mode } = getStripeEnv();
  const stripe = getStripeClient();

  if (!paymentsEnabled || !stripe) {
    throw new Error('STRIPE_DISABLED');
  }

  // Stripe amount must be an integer in minor units. Fail-closed on floats/NaN/huge values.
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error('STRIPE_INVALID_AMOUNT');
  }

  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount,
        currency: currency.toLowerCase(),
        metadata: { orderId, mode: mode ?? 'test' },
        automatic_payment_methods: { enabled: true },
      },
      idempotencyKey ? { idempotencyKey } : undefined
    );

    if (!intent.client_secret) {
      throw new Error('STRIPE_CLIENT_SECRET_MISSING');
    }

    return { clientSecret: intent.client_secret, paymentIntentId: intent.id };
  } catch (error) {
    logError('Stripe payment intent creation failed', error);
    throw new Error('STRIPE_PAYMENT_INTENT_FAILED');
  }
}

export async function retrievePaymentIntent(paymentIntentId: string): Promise<{
  clientSecret: string;
  paymentIntentId: string;
}> {
  const { paymentsEnabled } = getStripeEnv();
  const stripe = getStripeClient();

  if (!paymentsEnabled || !stripe) {
    throw new Error('STRIPE_DISABLED');
  }

  if (!paymentIntentId || paymentIntentId.trim().length === 0) {
    throw new Error('STRIPE_INVALID_PAYMENT_INTENT_ID');
  }

  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (!intent.client_secret) throw new Error('STRIPE_CLIENT_SECRET_MISSING');
    return { clientSecret: intent.client_secret, paymentIntentId: intent.id };
  } catch (error) {
    logError('Stripe payment intent retrieval failed', error);
    throw new Error('STRIPE_PAYMENT_INTENT_FAILED');
  }
}

export async function retrieveCharge(chargeId: string): Promise<Stripe.Charge> {
  const { paymentsEnabled } = getStripeEnv();
  const stripe = getStripeClient();

  if (!paymentsEnabled || !stripe) {
    throw new Error('STRIPE_DISABLED');
  }

  if (!chargeId || chargeId.trim().length === 0) {
    throw new Error('STRIPE_INVALID_CHARGE_ID');
  }

  try {
    return await stripe.charges.retrieve(chargeId);
  } catch (error) {
    logError('Stripe charge retrieval failed', error);
    throw new Error('STRIPE_CHARGE_RETRIEVE_FAILED');
  }
}

type VerifyWebhookSignatureInput = {
  rawBody: string;
  signatureHeader: string | null;
};

export function verifyWebhookSignature({
  rawBody,
  signatureHeader,
}: VerifyWebhookSignatureInput): Stripe.Event {
  const { paymentsEnabled, webhookSecret } = getStripeEnv();
  const stripe = getStripeClient();

  if (!paymentsEnabled || !stripe || !webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_DISABLED');
  }

  if (!signatureHeader) {
    throw new Error('STRIPE_MISSING_SIGNATURE');
  }

  try {
    return stripe.webhooks.constructEvent(
      rawBody,
      signatureHeader,
      webhookSecret
    );
  } catch (error) {
    logError('Stripe webhook signature verification failed', error);
    throw new Error('STRIPE_INVALID_SIGNATURE');
  }
}
