import crypto from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetEnvCache } from '@/lib/env';

const originalFetch = globalThis.fetch;

function makeResponse(body: string) {
  return {
    ok: true,
    status: 200,
    text: async () => body,
  };
}

beforeEach(() => {
  vi.stubEnv('MONO_MERCHANT_TOKEN', 'test_token');
  vi.stubEnv('PAYMENTS_ENABLED', 'true');
  vi.stubEnv('MONO_API_BASE', 'https://api.example.test');
  vi.stubEnv('MONO_INVOICE_TIMEOUT_MS', '5000');
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

describe('monobank webhook crypto', () => {
  it('verifies a valid signature', async () => {
    const { verifyWebhookSignature } = await import('@/lib/psp/monobank');

    const body = Buffer.from('{"invoiceId":"inv_1","status":"success"}');
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });

    const signature = crypto
      .sign('sha256', body, privateKey)
      .toString('base64');
    const publicKeyPem = publicKey.export({
      type: 'spki',
      format: 'pem',
    }) as string;

    expect(
      verifyWebhookSignature(body, signature, Buffer.from(publicKeyPem))
    ).toBe(true);
  });

  it('rejects when payload changes', async () => {
    const { verifyWebhookSignature } = await import('@/lib/psp/monobank');

    const body = Buffer.from('{"invoiceId":"inv_2","status":"success"}');
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });

    const signature = crypto
      .sign('sha256', body, privateKey)
      .toString('base64');
    const publicKeyPem = publicKey.export({
      type: 'spki',
      format: 'pem',
    }) as string;

    const tampered = Buffer.from(body);
    tampered[0] = tampered[0] ^ 0xff;

    expect(
      verifyWebhookSignature(tampered, signature, Buffer.from(publicKeyPem))
    ).toBe(false);
  });

  it('refreshes pubkey once when cached key fails', async () => {
    const body = Buffer.from('{"invoiceId":"inv_3","status":"success"}');
    const { publicKey: wrongPub } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });
    const { publicKey: rightPub, privateKey: rightPriv } =
      crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

    const wrongPem = wrongPub.export({ type: 'spki', format: 'pem' }) as string;
    const rightPem = rightPub.export({ type: 'spki', format: 'pem' }) as string;
    const signature = crypto.sign('sha256', body, rightPriv).toString('base64');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(JSON.stringify({ key: wrongPem })))
      .mockResolvedValueOnce(makeResponse(JSON.stringify({ key: rightPem })));
    globalThis.fetch = fetchMock as any;

    const { verifyWebhookSignatureWithRefresh } =
      await import('@/lib/psp/monobank');

    const ok = await verifyWebhookSignatureWithRefresh({
      rawBodyBytes: body,
      signature,
    });

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns false when refresh still fails', async () => {
    const body = Buffer.from('{"invoiceId":"inv_4","status":"success"}');
    const { publicKey: fetchedPub } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });
    const { privateKey: signingPriv } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });
    const wrongPem = fetchedPub.export({
      type: 'spki',
      format: 'pem',
    }) as string;
    const signature = crypto
      .sign('sha256', body, signingPriv)
      .toString('base64');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(JSON.stringify({ key: wrongPem })))
      .mockResolvedValueOnce(makeResponse(JSON.stringify({ key: wrongPem })));
    globalThis.fetch = fetchMock as any;

    const { verifyWebhookSignatureWithRefresh } =
      await import('@/lib/psp/monobank');

    const ok = await verifyWebhookSignatureWithRefresh({
      rawBodyBytes: body,
      signature,
    });

    expect(ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
