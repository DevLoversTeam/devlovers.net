import crypto from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetEnvCache } from '@/lib/env';

const originalFetch = globalThis.fetch;

function makeOkResponse(body: string) {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

beforeEach(() => {
  vi.stubEnv('MONO_MERCHANT_TOKEN', 'test_mono_token');
  vi.stubEnv('PAYMENTS_ENABLED', 'true');
  vi.stubEnv('MONO_API_BASE', 'https://api.example.test');
  vi.stubEnv('MONO_INVOICE_TIMEOUT_MS', '5000');
  vi.stubEnv('MONO_PUBLIC_KEY', undefined);

  resetEnvCache();
  vi.resetModules();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

describe('monobank webhook signature verify', () => {
  it('valid signature passes', async () => {
    const { verifyWebhookSignature } = await import('@/lib/psp/monobank');

    const rawBody = Buffer.from(
      '{"invoiceId":"inv_sig_ok","status":"success"}'
    );
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });

    const signature = crypto
      .sign('sha256', rawBody, privateKey)
      .toString('base64');
    const publicPem = publicKey.export({
      type: 'spki',
      format: 'pem',
    }) as string;

    const ok = verifyWebhookSignature(
      rawBody,
      signature,
      Buffer.from(publicPem)
    );
    expect(ok).toBe(true);
  });

  it('invalid signature fails', async () => {
    const { verifyWebhookSignature } = await import('@/lib/psp/monobank');

    const rawBody = Buffer.from(
      '{"invoiceId":"inv_sig_bad","status":"success"}'
    );
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });

    const signature = crypto
      .sign('sha256', rawBody, privateKey)
      .toString('base64');
    const publicPem = publicKey.export({
      type: 'spki',
      format: 'pem',
    }) as string;

    const tampered = Buffer.from(rawBody);
    tampered[0] = tampered[0] ^ 0xff;

    const ok = verifyWebhookSignature(
      tampered,
      signature,
      Buffer.from(publicPem)
    );
    expect(ok).toBe(false);
  });

  it('refresh-once: wrong key first, then correct key succeeds with exactly two fetches', async () => {
    const rawBody = Buffer.from(
      '{"invoiceId":"inv_refresh_ok","status":"success"}'
    );
    const { publicKey: wrongPublicKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });
    const { publicKey: rightPublicKey, privateKey: rightPrivateKey } =
      crypto.generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
      });

    const wrongPem = wrongPublicKey.export({
      type: 'spki',
      format: 'pem',
    }) as string;
    const rightPem = rightPublicKey.export({
      type: 'spki',
      format: 'pem',
    }) as string;
    const signature = crypto
      .sign('sha256', rawBody, rightPrivateKey)
      .toString('base64');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeOkResponse(JSON.stringify({ key: wrongPem })))
      .mockResolvedValueOnce(makeOkResponse(JSON.stringify({ key: rightPem })));
    globalThis.fetch = fetchMock as any;

    const { verifyWebhookSignatureWithRefresh } =
      await import('@/lib/psp/monobank');

    const ok = await verifyWebhookSignatureWithRefresh({
      rawBodyBytes: rawBody,
      signature,
    });

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refresh-once still fails with wrong key twice and exactly two fetches', async () => {
    const rawBody = Buffer.from(
      '{"invoiceId":"inv_refresh_fail","status":"success"}'
    );
    const { publicKey: wrongPublicKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });
    const { privateKey: signerPrivateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });

    const wrongPem = wrongPublicKey.export({
      type: 'spki',
      format: 'pem',
    }) as string;
    const signature = crypto
      .sign('sha256', rawBody, signerPrivateKey)
      .toString('base64');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeOkResponse(JSON.stringify({ key: wrongPem })))
      .mockResolvedValueOnce(makeOkResponse(JSON.stringify({ key: wrongPem })));
    globalThis.fetch = fetchMock as any;

    const { verifyWebhookSignatureWithRefresh } =
      await import('@/lib/psp/monobank');

    const ok = await verifyWebhookSignatureWithRefresh({
      rawBodyBytes: rawBody,
      signature,
    });

    expect(ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('classifies pubkey fetch outage as verification_unavailable (retryable)', async () => {
    const rawBody = Buffer.from(
      '{"invoiceId":"inv_pubkey_unavailable","status":"success"}'
    );
    const signature = Buffer.from('sig').toString('base64');

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ errCode: 'TEMP_UNAVAILABLE' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      })
    );
    globalThis.fetch = fetchMock as any;

    const { verifyWebhookSignatureWithRefreshDetailed } =
      await import('@/lib/psp/monobank');

    const result = await verifyWebhookSignatureWithRefreshDetailed({
      rawBodyBytes: rawBody,
      signature,
    });

    if (result.ok) {
      throw new Error(
        'Expected verification_unavailable result for pubkey outage'
      );
    }
    expect(result.reason).toBe('verification_unavailable');
    expect(result.retryable).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
