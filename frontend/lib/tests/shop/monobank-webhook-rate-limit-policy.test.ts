import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MonobankWebhookVerifyResult } from '@/lib/psp/monobank';
import { InvalidPayloadError } from '@/lib/services/errors';

function verifiedResult(): MonobankWebhookVerifyResult {
  return { ok: true, reason: 'verified' };
}

function invalidSignatureResult(): MonobankWebhookVerifyResult {
  return { ok: false, reason: 'invalid_signature', retryable: false };
}

function verificationUnavailableResult(args: {
  retryable: boolean;
  errorCode?: string;
}): MonobankWebhookVerifyResult {
  return {
    ok: false,
    reason: 'verification_unavailable',
    retryable: args.retryable,
    ...(args.errorCode ? { errorCode: args.errorCode } : {}),
  };
}

const enforceRateLimitMock = vi.fn(async () => ({
  ok: false,
  retryAfterSeconds: 12,
}));
const verifyWebhookSignatureWithRefreshDetailedMock = vi.fn(
  async (): Promise<MonobankWebhookVerifyResult> => verifiedResult()
);
const handleMonobankWebhookMock = vi.fn(async () => ({
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
  verifyWebhookSignatureWithRefreshDetailed:
    verifyWebhookSignatureWithRefreshDetailedMock,
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
    verifyWebhookSignatureWithRefreshDetailedMock.mockResolvedValue({
      ...verifiedResult(),
    });
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
    expect(
      verifyWebhookSignatureWithRefreshDetailedMock
    ).not.toHaveBeenCalled();
    expect(handleMonobankWebhookMock).not.toHaveBeenCalled();
  });

  it('rejects missing-signature traffic with 401 when not rate-limited', async () => {
    enforceRateLimitMock.mockResolvedValue({
      ok: true,
      retryAfterSeconds: 0,
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

    expect(res.status).toBe(401);
    expect(json.code).toBe('MONO_SIGNATURE_MISSING');
    expect(
      verifyWebhookSignatureWithRefreshDetailedMock
    ).not.toHaveBeenCalled();
    expect(handleMonobankWebhookMock).not.toHaveBeenCalled();
  });

  it('rejects invalid signatures with 401 when not rate-limited', async () => {
    enforceRateLimitMock.mockResolvedValue({
      ok: true,
      retryAfterSeconds: 0,
    });
    verifyWebhookSignatureWithRefreshDetailedMock.mockResolvedValue({
      ...invalidSignatureResult(),
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

    expect(res.status).toBe(401);
    expect(json.code).toBe('MONO_SIGNATURE_INVALID');
    expect(handleMonobankWebhookMock).not.toHaveBeenCalled();
  });

  it('returns 503 + Retry-After when signature verification is transiently unavailable', async () => {
    verifyWebhookSignatureWithRefreshDetailedMock.mockResolvedValue({
      ...verificationUnavailableResult({
        retryable: true,
        errorCode: 'PSP_TIMEOUT',
      }),
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

    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('10');
    expect(json.code).toBe('WEBHOOK_RETRYABLE');
    expect(json.reason).toBe('SIGNATURE_VERIFICATION_UNAVAILABLE');
    expect(handleMonobankWebhookMock).not.toHaveBeenCalled();
    expect(enforceRateLimitMock).not.toHaveBeenCalled();
  });

  it('returns 500 when signature verification failure is permanent', async () => {
    verifyWebhookSignatureWithRefreshDetailedMock.mockResolvedValue({
      ...verificationUnavailableResult({
        retryable: false,
        errorCode: 'PSP_AUTH_FAILED',
      }),
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

    expect(res.status).toBe(500);
    expect(json.code).toBe('MONO_SIGNATURE_VERIFICATION_FAILED');
    expect(json.reason).toBe('PERMANENT');
    expect(handleMonobankWebhookMock).not.toHaveBeenCalled();
    expect(enforceRateLimitMock).not.toHaveBeenCalled();
  });

  it('returns 503 + Retry-After when signed apply fails with transient error', async () => {
    verifyWebhookSignatureWithRefreshDetailedMock.mockResolvedValue({
      ...verifiedResult(),
    });
    handleMonobankWebhookMock.mockRejectedValueOnce(new Error('DB_TEMP_FAIL'));

    const req = makeReq(
      JSON.stringify({
        invoiceId: 'inv_123',
        status: 'success',
      }),
      true
    );

    const res = await POST(req);
    const json: any = await res.json();

    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('10');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(json.code).toBe('WEBHOOK_RETRYABLE');
    expect(json.retryAfterSeconds).toBe(10);
  });

  it('acknowledges with 200 when signed apply fails with invalid payload (non-retryable)', async () => {
    verifyWebhookSignatureWithRefreshDetailedMock.mockResolvedValue({
      ...verifiedResult(),
    });
    handleMonobankWebhookMock.mockRejectedValueOnce(
      new InvalidPayloadError('Invalid webhook payload', {
        code: 'INVALID_PAYLOAD',
      })
    );

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
  });
});
