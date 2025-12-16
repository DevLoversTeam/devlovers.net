// lib/psp/stripe.ts
import Stripe from "stripe"

import { getStripeEnv } from "@/lib/env/stripe"
import { logError } from "@/lib/logging"

const { secretKey, webhookSecret, paymentsEnabled, mode } = getStripeEnv()

// Ініціалізуємо Stripe один раз
const stripe = secretKey
  ? new Stripe(secretKey, {
      apiVersion: "2025-11-17.clover",
    })
  : null

type CreatePaymentIntentInput = {
  amount: number
  currency: string
  orderId: string
  idempotencyKey?: string
}

export async function createPaymentIntent({
  amount,
  currency,
  orderId,
  idempotencyKey,
}: CreatePaymentIntentInput): Promise<{ clientSecret: string; paymentIntentId: string }> {
  if (!paymentsEnabled || !stripe) {
    // /api/checkout реагує на помилки з префіксом STRIPE_
    throw new Error("STRIPE_DISABLED")
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("STRIPE_INVALID_AMOUNT")
  }

  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount,
        currency: currency.toLowerCase(),
        metadata: {
          orderId,
          mode: mode ?? "test",
        },
        automatic_payment_methods: { enabled: true },
      },
      idempotencyKey ? { idempotencyKey } : undefined
    )

    if (!intent.client_secret) {
      throw new Error("STRIPE_CLIENT_SECRET_MISSING")
    }

    return {
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
    }
  } catch (error) {
    logError("Stripe payment intent creation failed", error)
    throw new Error("STRIPE_PAYMENT_INTENT_FAILED")
  }
}

export async function retrievePaymentIntent(paymentIntentId: string): Promise<{
  clientSecret: string
  paymentIntentId: string
}> {
  if (!paymentsEnabled || !stripe) {
    throw new Error("STRIPE_DISABLED")
  }

  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId)

    if (!intent.client_secret) {
      throw new Error("STRIPE_CLIENT_SECRET_MISSING")
    }

    return { clientSecret: intent.client_secret, paymentIntentId: intent.id }
  } catch (error) {
    logError("Stripe payment intent retrieval failed", error)
    throw new Error("STRIPE_PAYMENT_INTENT_FAILED")
  }
}

type VerifyWebhookSignatureInput = {
  rawBody: string
  signatureHeader: string | null
}

export function verifyWebhookSignature({
  rawBody,
  signatureHeader,
}: VerifyWebhookSignatureInput): Stripe.Event {
  if (!paymentsEnabled || !stripe || !webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_DISABLED")
  }

  if (!signatureHeader) {
    throw new Error("STRIPE_MISSING_SIGNATURE")
  }

  try {
    const event = stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret)
    return event
  } catch (error) {
    logError("Stripe webhook signature verification failed", error)
    throw new Error("STRIPE_INVALID_SIGNATURE")
  }
}
