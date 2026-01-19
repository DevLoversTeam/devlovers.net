import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveStripeWebhookRateLimit } from '@/lib/security/stripe-webhook-rate-limit';

describe('stripe webhook rate limit env precedence', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it('uses defaults (30/60) when no env vars are set', () => {
    expect(resolveStripeWebhookRateLimit('missing_sig')).toEqual({
      max: 30,
      windowSeconds: 60,
    });

    expect(resolveStripeWebhookRateLimit('invalid_sig')).toEqual({
      max: 30,
      windowSeconds: 60,
    });
  });
  it('uses invalid_sig envs as legacy fallback for missing_sig when only invalid_sig is set', () => {
    vi.stubEnv('STRIPE_WEBHOOK_INVALID_SIG_RL_MAX', '11');
    vi.stubEnv('STRIPE_WEBHOOK_INVALID_SIG_RL_WINDOW_SECONDS', '111');

    expect(resolveStripeWebhookRateLimit('missing_sig')).toEqual({
      max: 11,
      windowSeconds: 111,
    });

    expect(resolveStripeWebhookRateLimit('invalid_sig')).toEqual({
      max: 11,
      windowSeconds: 111,
    });
  });

  it('prefers missing_sig envs when set; invalid_sig remains its own', () => {
    vi.stubEnv('STRIPE_WEBHOOK_MISSING_SIG_RL_MAX', '22');
    vi.stubEnv('STRIPE_WEBHOOK_MISSING_SIG_RL_WINDOW_SECONDS', '222');
    vi.stubEnv('STRIPE_WEBHOOK_INVALID_SIG_RL_MAX', '33');
    vi.stubEnv('STRIPE_WEBHOOK_INVALID_SIG_RL_WINDOW_SECONDS', '333');

    expect(resolveStripeWebhookRateLimit('missing_sig')).toEqual({
      max: 22,
      windowSeconds: 222,
    });

    expect(resolveStripeWebhookRateLimit('invalid_sig')).toEqual({
      max: 33,
      windowSeconds: 333,
    });
  });

  it('uses generic envs for both reasons when only generic is set', () => {
    vi.stubEnv('STRIPE_WEBHOOK_RL_MAX', '44');
    vi.stubEnv('STRIPE_WEBHOOK_RL_WINDOW_SECONDS', '444');

    expect(resolveStripeWebhookRateLimit('missing_sig')).toEqual({
      max: 44,
      windowSeconds: 444,
    });

    expect(resolveStripeWebhookRateLimit('invalid_sig')).toEqual({
      max: 44,
      windowSeconds: 444,
    });
  });

  it('supports partial config (field-by-field): missing_sig MAX can override while WINDOW falls back', () => {
    vi.stubEnv('STRIPE_WEBHOOK_MISSING_SIG_RL_MAX', '66');
    vi.stubEnv('STRIPE_WEBHOOK_RL_WINDOW_SECONDS', '555'); // fallback source for window

    expect(resolveStripeWebhookRateLimit('missing_sig')).toEqual({
      max: 66,
      windowSeconds: 555,
    });
  });

  it('ignores empty/whitespace and non-numeric env values (falls back safely)', () => {
    vi.stubEnv('STRIPE_WEBHOOK_RL_MAX', '   ');
    vi.stubEnv('STRIPE_WEBHOOK_RL_WINDOW_SECONDS', 'nope');

    expect(resolveStripeWebhookRateLimit('missing_sig')).toEqual({
      max: 30,
      windowSeconds: 60,
    });
    expect(resolveStripeWebhookRateLimit('invalid_sig')).toEqual({
      max: 30,
      windowSeconds: 60,
    });
  });

  it('prefers reason-specific envs over generic when both are set', () => {
    vi.stubEnv('STRIPE_WEBHOOK_RL_MAX', '55');
    vi.stubEnv('STRIPE_WEBHOOK_RL_WINDOW_SECONDS', '555');
    vi.stubEnv('STRIPE_WEBHOOK_MISSING_SIG_RL_MAX', '66');
    vi.stubEnv('STRIPE_WEBHOOK_MISSING_SIG_RL_WINDOW_SECONDS', '666');
    vi.stubEnv('STRIPE_WEBHOOK_INVALID_SIG_RL_MAX', '77');
    vi.stubEnv('STRIPE_WEBHOOK_INVALID_SIG_RL_WINDOW_SECONDS', '777');

    expect(resolveStripeWebhookRateLimit('missing_sig')).toEqual({
      max: 66,
      windowSeconds: 666,
    });

    expect(resolveStripeWebhookRateLimit('invalid_sig')).toEqual({
      max: 77,
      windowSeconds: 777,
    });
  });
});
