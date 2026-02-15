import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const monoLogInfoMock = vi.fn();
const monoLogWarnMock = vi.fn();
const monoLogErrorMock = vi.fn();

const logInfoMock = vi.fn();
const logWarnMock = vi.fn();
const logErrorMock = vi.fn();

const verifyWebhookSignatureWithRefreshMock = vi.fn(
  async (..._args: unknown[]) => false
);
const handleMonobankWebhookMock = vi.fn(async (..._args: unknown[]) => ({
  invoiceId: 'inv_test',
  appliedResult: 'applied',
  deduped: false,
}));

vi.mock('@/lib/logging/monobank', async () => {
  const actual = await vi.importActual<any>('@/lib/logging/monobank');
  return {
    ...actual,
    monoLogInfo: (...args: unknown[]) => monoLogInfoMock(...args),
    monoLogWarn: (...args: unknown[]) => monoLogWarnMock(...args),
    monoLogError: (...args: unknown[]) => monoLogErrorMock(...args),
  };
});

vi.mock('@/lib/logging', async () => {
  const actual = await vi.importActual<any>('@/lib/logging');
  return {
    ...actual,
    logInfo: (...args: unknown[]) => logInfoMock(...args),
    logWarn: (...args: unknown[]) => logWarnMock(...args),
    logError: (...args: unknown[]) => logErrorMock(...args),
  };
});

vi.mock('@/lib/psp/monobank', () => ({
  verifyWebhookSignatureWithRefresh: (...args: unknown[]) =>
    verifyWebhookSignatureWithRefreshMock(...args),
}));

vi.mock('@/lib/services/orders/monobank-webhook', () => ({
  handleMonobankWebhook: (...args: unknown[]) =>
    handleMonobankWebhookMock(...args),
}));

vi.mock('@/lib/security/rate-limit', () => ({
  getRateLimitSubject: vi.fn(() => 'rl_test_subject'),
  enforceRateLimit: vi.fn(async () => ({ ok: true, remaining: 999 })),
  rateLimitResponse: vi.fn(() => new Response('rate_limited', { status: 429 })),
}));

function expectNoUnsafeMeta(meta: Record<string, unknown>) {
  const forbidden = [
    'rawBodyBytes',
    'rawBody',
    'parsedPayload',
    'headers',
    'authorization',
    'cookie',
    'statusToken',
    'basket',
    'basketOrder',
    'email',
    'phone',
  ];
  for (const key of forbidden) {
    expect(meta).not.toHaveProperty(key);
  }
}

function expectSafeShape(meta: Record<string, unknown>) {
  expect(typeof meta.rawSha256).toBe('string');
  expect((meta.rawSha256 as string).length).toBe(64);
  expect(meta.rawBytesLen).toBeTypeOf('number');
  expect(meta.mode).toBe('apply');
  expect(meta.hasXSign).toBe(true);
}

async function postWebhookRaw(rawBody: string, signature = 'test-signature') {
  const { POST } = await import('@/app/api/shop/webhooks/monobank/route');

  const req = new NextRequest('http://localhost/api/shop/webhooks/monobank', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-sign': signature,
      'x-request-id': 'mono-webhook-logging-safety-test',
    },
    body: rawBody,
  });

  return POST(req);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MONO_WEBHOOK_MODE = 'apply';
});

afterEach(() => {
  delete process.env.MONO_WEBHOOK_MODE;
});

describe('monobank webhook logging safety', () => {
  it('invalid signature logs safe diagnostics only', async () => {
    verifyWebhookSignatureWithRefreshMock.mockResolvedValue(false);

    const res = await postWebhookRaw(
      JSON.stringify({ invoiceId: 'inv_1', status: 'success' })
    );
    expect(res.status).toBe(200);
    expect(handleMonobankWebhookMock).not.toHaveBeenCalled();

    const sigWarn = monoLogWarnMock.mock.calls.find(
      call => call?.[0] === 'MONO_SIG_INVALID'
    );
    expect(sigWarn).toBeTruthy();

    const meta = (sigWarn?.[1] ?? {}) as Record<string, unknown>;
    expectSafeShape(meta);
    expect(meta.reason).toBe('SIG_INVALID');
    expectNoUnsafeMeta(meta);
  });

  it('invalid payload logs safe diagnostics only', async () => {
    verifyWebhookSignatureWithRefreshMock.mockResolvedValue(true);

    const res = await postWebhookRaw('{invalid json');
    expect(res.status).toBe(200);
    expect(handleMonobankWebhookMock).not.toHaveBeenCalled();

    const invalidPayloadWarn = logWarnMock.mock.calls.find(
      call => call?.[0] === 'monobank_webhook_payload_invalid'
    );
    expect(invalidPayloadWarn).toBeTruthy();

    const meta = (invalidPayloadWarn?.[1] ?? {}) as Record<string, unknown>;
    expectSafeShape(meta);
    expect(meta.reason).toBe('INVALID_PAYLOAD');
    expectNoUnsafeMeta(meta);
  });
});
