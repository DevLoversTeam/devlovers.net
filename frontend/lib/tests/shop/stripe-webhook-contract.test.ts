import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/logging', async () => {
  const actual = await vi.importActual<any>('@/lib/logging');
  return {
    ...actual,
    logError: vi.fn(),
  };
});
const ORIG_ENV = process.env;
let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

function makeReq(body: string, headers?: Record<string, string>) {
  return new NextRequest(
    new Request('http://localhost/api/shop/webhooks/stripe', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(headers ?? {}),
      },
      body,
    })
  );
}

describe('P0-3.3 Stripe webhook contract: disabled vs invalid signature', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...ORIG_ENV };

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = ORIG_ENV;
    consoleErrorSpy?.mockRestore();
    consoleErrorSpy = null;
  });

  it('returns 500 WEBHOOK_DISABLED when webhook env is missing/disabled', async () => {
    const { POST } = await import('@/app/api/shop/webhooks/stripe/route');

    process.env.PAYMENTS_ENABLED = 'true';
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = '';

    const res = await POST(
      makeReq('{"id":"evt_test"}', { 'stripe-signature': 't=0,v1=deadbeef' })
    );

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.code).toBe('WEBHOOK_DISABLED');
  });

  it('returns 400 INVALID_SIGNATURE when signature is invalid', async () => {
    process.env.PAYMENTS_ENABLED = 'true';
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_dummy';

    const { POST } = await import('@/app/api/shop/webhooks/stripe/route');

    const res = await POST(
      makeReq('{"id":"evt_test"}', { 'stripe-signature': 't=0,v1=deadbeef' })
    );

    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.code).toBe('INVALID_SIGNATURE');
  });
});
