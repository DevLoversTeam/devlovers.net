import crypto from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetEnvCache } from '@/lib/env';

const ENV_KEYS = [
  'DATABASE_URL',
  'MONO_MERCHANT_TOKEN',
  'PAYMENTS_ENABLED',
  'MONO_PUBLIC_KEY',
  'MONO_API_BASE',
  'MONO_INVOICE_TIMEOUT_MS',
] as const;

const previousEnv: Record<string, string | undefined> = {};
const originalFetch = globalThis.fetch;

function rememberEnv() {
  for (const key of ENV_KEYS) {
    previousEnv[key] = process.env[key];
  }
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = previousEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function makeOkResponse(body: string) {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

beforeEach(() => {
  rememberEnv();
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? 'postgres://user:pass@localhost:5432/dev';
  process.env.MONO_MERCHANT_TOKEN = 'test_mono_token';
  process.env.PAYMENTS_ENABLED = 'true';
  process.env.MONO_API_BASE = 'https://api.example.test';
  process.env.MONO_INVOICE_TIMEOUT_MS = '5000';
  delete process.env.MONO_PUBLIC_KEY;

  resetEnvCache();
  vi.resetModules();
  vi.restoreAllMocks();
});

afterEach(() => {
  restoreEnv();
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
});
