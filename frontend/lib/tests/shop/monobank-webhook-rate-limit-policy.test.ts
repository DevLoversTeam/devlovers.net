import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const enforceRateLimitMock = vi.fn(async (..._args: any[]) => ({
  ok: false,
  retryAfterSeconds: 12,
}));
const verifyWebhookSignatureWithRefreshMock = vi.fn(
  async (..._args: any[]) => true
);
const handleMonobankWebhookMock = vi.fn(async (..._args: any[]) => ({
  invoiceId: 'inv_test',
  appliedResult: 'applied',
  deduped: false,
}));

vi.mock('@/lib/logging', async () => {
  const actual = await vi.importActual<any>('@/lib/logging');
  return {
    ...actual,
    logWarn: vi.fn(),
    logError: vi.fn(),
    logInfo: vi.fn(),
  };
});

vi.mock('@/lib/logging/monobank', async () => {
  const actual = await vi.importActual<any>('@/lib/logging/monobank');
  return {
    ...actual,
    monoLogWarn: vi.fn(),
    monoLogError: vi.fn(),
    monoLogInfo: vi.fn(),
  };
});

vi.mock('@/lib/psp/monobank', () => ({
  verifyWebhookSignatureWithRefresh: verifyWebhookSignatureWithRefreshMock,
}));

vi.mock('@/lib/services/orders/monobank-webhook', () => ({
  handleMonobankWebhook: handleMonobankWebhookMock,
}));

vi.mock('@/lib/security/rate-limit', () => ({
  getRateLimitSubject: vi.fn(() => 'rl_webhook_subject'),
  enforceRateLimit: enforceRateLimitMock,
  rateLimitResponse: ({
    retryAfterSeconds,
    details,
  }: {
    retryAfterSeconds: number;
    details?: Record<string, unknown>;
  }) => {
    const res = NextResponse.json(
      {
        success: false,
        code: 'RATE_LIMITED',
        retryAfterSeconds,
        ...(details ? { details } : {}),
      },
      { status: 429 }
    );
    res.headers.set('Retry-After', String(retryAfterSeconds));
    res.headers.set('Cache-Control', 'no-store');
    return res;
  },
}));

const { POST } = await import('@/app/api/shop/webhooks/monobank/route');

function makeReq(body: string, withSignature: boolean) {
  const headers = new Headers({
    'content-type': 'application/json',
    'x-request-id': 'mono-webhook-rate-limit-policy',
  });
  if (withSignature) headers.set('x-sign', 'signature-value');

  return new NextRequest('http://localhost/api/shop/webhooks/monobank', {
    method: 'POST',
    headers,
    body,
  });
}

describe('monobank webhook rate limit policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MONO_WEBHOOK_MODE = 'apply';
  });

  afterEach(() => {
    delete process.env.MONO_WEBHOOK_MODE;
  });

  it('does not rate-limit valid signed webhook events', async () => {
    verifyWebhookSignatureWithRefreshMock.mockResolvedValue(true);
    enforceRateLimitMock.mockResolvedValue({
      ok: false,
      retryAfterSeconds: 15,
    });

    const req = makeReq(
      JSON.stringify({
        invoiceId: 'inv_123',
        status: 'success',
      }),
      true
    );

    const res = await POST(req);
    const json: any = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(enforceRateLimitMock).not.toHaveBeenCalled();
    expect(handleMonobankWebhookMock).toHaveBeenCalledTimes(1);
  });

  it('rate-limits missing-signature traffic with 429 headers', async () => {
    enforceRateLimitMock.mockResolvedValue({
      ok: false,
      retryAfterSeconds: 12,
    });

    const req = makeReq(
      JSON.stringify({
        invoiceId: 'inv_123',
        status: 'success',
      }),
      false
    );

    const res = await POST(req);
    const json: any = await res.json();

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('12');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(json.code).toBe('RATE_LIMITED');
    expect(verifyWebhookSignatureWithRefreshMock).not.toHaveBeenCalled();
    expect(handleMonobankWebhookMock).not.toHaveBeenCalled();
  });
});
