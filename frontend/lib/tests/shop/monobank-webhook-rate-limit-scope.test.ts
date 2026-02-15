import { NextRequest } from 'next/server';
import { afterEach,beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mocks: MUST be before importing the route module.
vi.mock('@/lib/security/rate-limit', () => {
  return {
    enforceRateLimit: vi.fn(async () => ({ ok: false, retryAfterSeconds: 60 })),
    getRateLimitSubject: vi.fn(() => 'test_subject'),
    rateLimitResponse: vi.fn(
      ({
        retryAfterSeconds,
        details,
      }: {
        retryAfterSeconds: number;
        details: { scope: string };
      }) =>
        new Response(JSON.stringify({ retryAfterSeconds, details }), {
          status: 429,
          headers: { 'content-type': 'application/json' },
        })
    ),
  };
});

vi.mock('@/lib/psp/monobank', () => {
  return {
    verifyWebhookSignatureWithRefresh: vi.fn(async () => false),
  };
});

import { POST } from '@/app/api/shop/webhooks/monobank/route';

function makeReq(opts: { hasSign: boolean }) {
  const headers = new Headers();
  // No Origin header → should not be blocked by origin posture.
  if (opts.hasSign) headers.set('x-sign', 'bad_signature');

  return new NextRequest('http://localhost/api/shop/webhooks/monobank', {
    method: 'POST',
    headers,
    body: JSON.stringify({ hello: 'world' }),
  });
}

beforeEach(() => {
  process.env.MONO_WEBHOOK_MODE = 'apply';
});

afterEach(() => {
  delete process.env.MONO_WEBHOOK_MODE;
  vi.clearAllMocks();
});

describe('monobank webhook rate-limit scope regression', () => {
  it('missing signature → scope = monobank_webhook_missing_signature', async () => {
    const res = await POST(makeReq({ hasSign: false }));
    expect(res.status).toBe(429);

    const body = await res.json();
    expect(body.details.scope).toBe('monobank_webhook_missing_signature');
  });

  it('invalid signature → scope = monobank_webhook_invalid_signature', async () => {
    const res = await POST(makeReq({ hasSign: true }));
    expect(res.status).toBe(429);

    const body = await res.json();
    expect(body.details.scope).toBe('monobank_webhook_invalid_signature');
  });
});
