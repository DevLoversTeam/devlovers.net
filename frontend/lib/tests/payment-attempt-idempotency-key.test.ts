import { describe, expect, it } from 'vitest';

import {
  buildMonobankAttemptIdempotencyKey,
  buildStripeAttemptIdempotencyKey,
} from '@/lib/services/orders/attempt-idempotency';

const uuidA = '11111111-1111-1111-1111-111111111111';
const uuidB = '22222222-2222-2222-2222-222222222222';

describe('payment_attempts idempotency_key format', () => {
  it('namespaces stripe attempts by provider', () => {
    const key = buildStripeAttemptIdempotencyKey('stripe', uuidA, 1);
    expect(key).toBe(`pi:stripe:${uuidA}:1`);
    expect(key).toMatch(/^pi:stripe:[0-9a-f-]{36}:\d+$/);
  });

  it('namespaces monobank attempts by provider', () => {
    const key = buildMonobankAttemptIdempotencyKey(uuidA, 2);
    expect(key).toBe(`mono:${uuidA}:2`);
    expect(key).toMatch(/^mono:[0-9a-f-]{36}:\d+$/);
  });

  it('cannot collide across providers', () => {
    const stripeKey = buildStripeAttemptIdempotencyKey('stripe', uuidA, 1);
    const monoKey = buildMonobankAttemptIdempotencyKey(uuidA, 1);
    expect(stripeKey).not.toBe(monoKey);
  });

  it('includes order id to avoid cross-order collisions', () => {
    const stripeKeyA = buildStripeAttemptIdempotencyKey('stripe', uuidA, 1);
    const stripeKeyB = buildStripeAttemptIdempotencyKey('stripe', uuidB, 1);
    expect(stripeKeyA).not.toBe(stripeKeyB);
  });
});
