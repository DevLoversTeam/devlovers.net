import { getClientEnv, getRuntimeEnv, getServerEnv } from "@/lib/env"

export type StripeEnv = {
  secretKey: string | null
  webhookSecret: string | null
  publishableKey: string | null
  paymentsEnabled: boolean
  mode: "test" | "live"
}

function derivePaymentsEnabled({
  flag,
  secretKey,
  webhookSecret,
  nodeEnv,
}: {
  flag: string
  secretKey?: string | null
  webhookSecret?: string | null
  nodeEnv: string
}) {
  if (flag !== "true") return false
  if (!secretKey || (!webhookSecret && nodeEnv !== "test")) {
    return false
  }
  return true
}

export function getStripeEnv(): StripeEnv {
  const runtimeEnv = getRuntimeEnv()
  const serverEnv = getServerEnv()
  const clientEnv = getClientEnv()

  const paymentsFlag = serverEnv.PAYMENTS_ENABLED ?? "false"
  const secretKey = serverEnv.STRIPE_SECRET_KEY ?? null
  const webhookSecret = serverEnv.STRIPE_WEBHOOK_SECRET ?? null
  const publishableKey = clientEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null
  const mode = serverEnv.STRIPE_MODE ?? (runtimeEnv.NODE_ENV === "production" ? "live" : "test")

  if (runtimeEnv.NODE_ENV !== "test" && paymentsFlag === "true") {
    if (!secretKey) {
      throw new Error("Missing STRIPE_SECRET_KEY environment variable.")
    }
    if (!webhookSecret) {
      throw new Error("Missing STRIPE_WEBHOOK_SECRET environment variable.")
    }
  }

  const paymentsEnabled = derivePaymentsEnabled({
    flag: paymentsFlag,
    secretKey,
    webhookSecret,
    nodeEnv: runtimeEnv.NODE_ENV,
  })

  if (!paymentsEnabled) {
    return {
      secretKey: null,
      webhookSecret: null,
      publishableKey: null,
      paymentsEnabled: false,
      mode,
    }
  }

  return {
    secretKey: secretKey ?? null,
    webhookSecret: webhookSecret ?? null,
    publishableKey,
    paymentsEnabled,
    mode,
  }
}

export function isPaymentsEnabled(): boolean {
  return getStripeEnv().paymentsEnabled
}
