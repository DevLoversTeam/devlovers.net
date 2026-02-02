export type StripeWebhookRateLimitReason = 'missing_sig' | 'invalid_sig';

type StripeWebhookRateLimitConfig = {
  max: number;
  windowSeconds: number;
};

const DEFAULT_STRIPE_WEBHOOK_RL_MAX = 30;
const DEFAULT_STRIPE_WEBHOOK_RL_WINDOW_SECONDS = 60;

function parsePositiveIntStrict(raw: string | undefined): number | null {
  if (raw === undefined) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (!/^\d+$/.test(trimmed)) return null;

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(parsed)) return null;

  return parsed > 0 ? parsed : null;
}

function resolveEnvPositiveInt(
  values: Array<string | undefined>,
  fallback: number
): number {
  for (const raw of values) {
    const parsed = parsePositiveIntStrict(raw);
    if (parsed !== null) return parsed;
  }
  return fallback;
}

export function resolveStripeWebhookRateLimit(
  reason: StripeWebhookRateLimitReason
): StripeWebhookRateLimitConfig {
  if (reason === 'missing_sig') {
    return {
      max: resolveEnvPositiveInt(
        [
          process.env.STRIPE_WEBHOOK_MISSING_SIG_RL_MAX,
          process.env.STRIPE_WEBHOOK_RL_MAX,

          process.env.STRIPE_WEBHOOK_INVALID_SIG_RL_MAX,
        ],
        DEFAULT_STRIPE_WEBHOOK_RL_MAX
      ),
      windowSeconds: resolveEnvPositiveInt(
        [
          process.env.STRIPE_WEBHOOK_MISSING_SIG_RL_WINDOW_SECONDS,
          process.env.STRIPE_WEBHOOK_RL_WINDOW_SECONDS,

          process.env.STRIPE_WEBHOOK_INVALID_SIG_RL_WINDOW_SECONDS,
        ],
        DEFAULT_STRIPE_WEBHOOK_RL_WINDOW_SECONDS
      ),
    };
  }

  return {
    max: resolveEnvPositiveInt(
      [
        process.env.STRIPE_WEBHOOK_INVALID_SIG_RL_MAX,
        process.env.STRIPE_WEBHOOK_RL_MAX,
      ],
      DEFAULT_STRIPE_WEBHOOK_RL_MAX
    ),
    windowSeconds: resolveEnvPositiveInt(
      [
        process.env.STRIPE_WEBHOOK_INVALID_SIG_RL_WINDOW_SECONDS,
        process.env.STRIPE_WEBHOOK_RL_WINDOW_SECONDS,
      ],
      DEFAULT_STRIPE_WEBHOOK_RL_WINDOW_SECONDS
    ),
  };
}
