import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetEnvCache } from '@/lib/env';

const originalFetch = globalThis.fetch;

function makeResponse(status: number, body: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  };
}

beforeEach(() => {
  vi.stubEnv('MONO_MERCHANT_TOKEN', 'test_token');
  vi.stubEnv('PAYMENTS_ENABLED', 'true');
  vi.stubEnv('MONO_API_BASE', 'https://api.example.test');
  vi.stubEnv('MONO_INVOICE_TIMEOUT_MS', '25');
  vi.stubEnv('MONO_PUBLIC_KEY', undefined);
  resetEnvCache();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

describe('monobank http client error mapping', () => {
  it('maps timeout to PSP_TIMEOUT', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
    globalThis.fetch = fetchMock as any;

    const { fetchWebhookPubKey, PspError } = await import('@/lib/psp/monobank');

    const p = fetchWebhookPubKey().then(
      () => null,
      e => e
    );

    await vi.advanceTimersByTimeAsync(25);
    const error = await p;

    expect(error).toBeInstanceOf(PspError);
    const err = error as InstanceType<typeof PspError>;
    expect(err.code).toBe('PSP_TIMEOUT');
    expect(err.safeMeta).toMatchObject({
      endpoint: '/api/merchant/pubkey',
      method: 'GET',
      timeoutMs: 25,
    });

    vi.useRealTimers();
  });

  it('maps 401 to PSP_AUTH_FAILED', async () => {
    const fetchMock = vi.fn(async () => makeResponse(401, 'unauthorized'));
    globalThis.fetch = fetchMock as any;

    const { fetchWebhookPubKey, PspError } = await import('@/lib/psp/monobank');

    try {
      await fetchWebhookPubKey();
      throw new Error('expected auth error');
    } catch (error) {
      expect(error).toBeInstanceOf(PspError);
      const err = error as InstanceType<typeof PspError>;
      expect(err.code).toBe('PSP_AUTH_FAILED');
      expect(err.safeMeta).toMatchObject({ httpStatus: 401 });
    }
  });

  it('maps 400 to PSP_BAD_REQUEST with monoCode', async () => {
    const body = JSON.stringify({ errorCode: 'X', message: 'bad' });
    const fetchMock = vi.fn(async () => makeResponse(400, body));
    globalThis.fetch = fetchMock as any;

    const { fetchWebhookPubKey, PspError } = await import('@/lib/psp/monobank');

    try {
      await fetchWebhookPubKey();
      throw new Error('expected bad request');
    } catch (error) {
      expect(error).toBeInstanceOf(PspError);
      const err = error as InstanceType<typeof PspError>;
      expect(err.code).toBe('PSP_BAD_REQUEST');
      expect(err.safeMeta).toMatchObject({
        httpStatus: 400,
        monoCode: 'X',
        monoMessage: 'bad',
      });
    }
  });
});
