import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const enforceRateLimitMock = vi.fn(async () => ({
  ok: true,
  retryAfterSeconds: 0,
}));
const verifyWebhookSignatureWithRefreshMock = vi.fn(async () => true);
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
  verifyWebhookSignatureWithRefresh: verifyWebhookSignatureWithRefreshMock,
}));

vi.mock('@/lib/services/orders/monobank-webhook', () => ({
  handleMonobankWebhook: handleMonobankWebhookMock,
}));

vi.mock('@/lib/security/rate-limit', () => ({
  getRateLimitSubject: vi.fn(() => 'rl_webhook_subject'),
  enforceRateLimit: enforceRateLimitMock,
  rateLimitResponse: vi.fn(),
}));

const { POST } = await import('@/app/api/shop/webhooks/monobank/route');

describe('monobank webhook origin posture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects browser-shaped requests with Origin before signature verification', async () => {
    const req = new NextRequest('http://localhost/api/shop/webhooks/monobank', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        'x-sign': 'test-signature',
      },
      body: JSON.stringify({ invoiceId: 'inv_123', status: 'success' }),
    });

    const failIfBodyRead = vi.fn(async () => {
      throw new Error('BODY_READ_BEFORE_ORIGIN_GUARD');
    });
    (req as any).arrayBuffer = failIfBodyRead;
    (req as any).text = failIfBodyRead;
    (req as any).json = failIfBodyRead;
    (req as any).formData = failIfBodyRead;

    const res = await POST(req);

    const json: any = await res.json();

    expect(res.status).toBe(403);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(json).toMatchObject({
      error: { code: 'ORIGIN_BLOCKED' },
      surface: 'monobank_webhook',
    });
    expect(typeof json?.error?.message).toBe('string');
    expect(verifyWebhookSignatureWithRefreshMock).not.toHaveBeenCalled();
    expect(handleMonobankWebhookMock).not.toHaveBeenCalled();
    expect(enforceRateLimitMock).not.toHaveBeenCalled();
    expect(failIfBodyRead).not.toHaveBeenCalled();
  });
});
