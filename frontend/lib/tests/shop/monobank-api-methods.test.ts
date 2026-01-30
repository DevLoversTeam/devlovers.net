import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetEnvCache } from '@/lib/env';

const ENV_KEYS = [
  'DATABASE_URL',
  'MONO_MERCHANT_TOKEN',
  'PAYMENTS_ENABLED',
  'MONO_PUBLIC_KEY',
  'MONO_API_BASE',
  'MONO_INVOICE_TIMEOUT_MS',
];

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

function makeResponse(status: number, body: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  };
}

async function expectPspError(
  fn: () => Promise<unknown>,
  code: string,
  meta?: Record<string, unknown>
) {
  try {
    await fn();
    throw new Error('expected error');
  } catch (error) {
    const { PspError } = await import('@/lib/psp/monobank');
    expect(error).toBeInstanceOf(PspError);
    const err = error as InstanceType<typeof PspError>;
    expect(err.code).toBe(code);
    if (meta) {
      expect(err.safeMeta).toMatchObject(meta);
    }
  }
}

beforeEach(() => {
  rememberEnv();
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? 'postgres://user:pass@localhost:5432/dev';
  process.env.MONO_MERCHANT_TOKEN = 'test_token';
  process.env.PAYMENTS_ENABLED = 'true';
  process.env.MONO_API_BASE = 'https://api.example.test';
  process.env.MONO_INVOICE_TIMEOUT_MS = '5000';
  delete process.env.MONO_PUBLIC_KEY;
  resetEnvCache();
  vi.resetModules();
});

afterEach(() => {
  restoreEnv();
  resetEnvCache();
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

describe('monobank api methods', () => {
  const createArgs = {
    amountMinor: 1234,
    validitySeconds: 600,
    reference: 'attempt-1',
    redirectUrl: 'https://shop.test/redirect',
    webHookUrl: 'https://shop.test/api/shop/webhooks/monobank',
    merchantPaymInfo: {
      reference: 'attempt-1',
      destination: 'Оплата замовлення 123',
      basketOrder: [
        {
          name: 'Item',
          qty: 1,
          sum: 1234,
          total: 1234,
          unit: 'шт.',
        },
      ],
    },
  };

  it('createInvoice returns normalized response on 2xx', async () => {
    const body = JSON.stringify({
      invoiceId: 'inv_1',
      pageUrl: 'https://pay.example.test/i/inv_1',
    });
    const fetchMock = vi.fn(async () => makeResponse(200, body));
    globalThis.fetch = fetchMock as any;

    const { createInvoice } = await import('@/lib/psp/monobank');
    const result = await createInvoice(createArgs);
    expect(result.invoiceId).toBe('inv_1');
    expect(result.pageUrl).toBe('https://pay.example.test/i/inv_1');
  });

  it('createInvoice maps 400 to PSP_BAD_REQUEST', async () => {
    const body = JSON.stringify({ errorCode: 'X', message: 'bad' });
    const fetchMock = vi.fn(async () => makeResponse(400, body));
    globalThis.fetch = fetchMock as any;

    const { createInvoice } = await import('@/lib/psp/monobank');
    await expectPspError(() => createInvoice(createArgs), 'PSP_BAD_REQUEST', {
      httpStatus: 400,
      monoCode: 'X',
    });
  });

  it('createInvoice maps 401 to PSP_AUTH_FAILED', async () => {
    const fetchMock = vi.fn(async () => makeResponse(401, 'unauthorized'));
    globalThis.fetch = fetchMock as any;

    const { createInvoice } = await import('@/lib/psp/monobank');
    await expectPspError(() => createInvoice(createArgs), 'PSP_AUTH_FAILED', {
      httpStatus: 401,
    });
  });

  it('createInvoice maps 500 to PSP_UNKNOWN', async () => {
    const fetchMock = vi.fn(async () => makeResponse(500, 'error'));
    globalThis.fetch = fetchMock as any;

    const { createInvoice } = await import('@/lib/psp/monobank');
    await expectPspError(() => createInvoice(createArgs), 'PSP_UNKNOWN', {
      httpStatus: 500,
    });
  });

  it('getInvoiceStatus returns normalized response on 2xx', async () => {
    const body = JSON.stringify({ invoiceId: 'inv_2', status: 'created' });
    const fetchMock = vi.fn(async () => makeResponse(200, body));
    globalThis.fetch = fetchMock as any;

    const { getInvoiceStatus } = await import('@/lib/psp/monobank');
    const result = await getInvoiceStatus('inv_2');
    expect(result.invoiceId).toBe('inv_2');
    expect(result.status).toBe('created');
  });

  it('getInvoiceStatus maps 400 to PSP_BAD_REQUEST', async () => {
    const body = JSON.stringify({ errorCode: 'X', message: 'bad' });
    const fetchMock = vi.fn(async () => makeResponse(400, body));
    globalThis.fetch = fetchMock as any;

    const { getInvoiceStatus } = await import('@/lib/psp/monobank');
    await expectPspError(() => getInvoiceStatus('inv_2'), 'PSP_BAD_REQUEST', {
      httpStatus: 400,
      monoCode: 'X',
    });
  });

  it('getInvoiceStatus maps 401 to PSP_AUTH_FAILED', async () => {
    const fetchMock = vi.fn(async () => makeResponse(401, 'unauthorized'));
    globalThis.fetch = fetchMock as any;

    const { getInvoiceStatus } = await import('@/lib/psp/monobank');
    await expectPspError(() => getInvoiceStatus('inv_2'), 'PSP_AUTH_FAILED', {
      httpStatus: 401,
    });
  });

  it('getInvoiceStatus maps 500 to PSP_UNKNOWN', async () => {
    const fetchMock = vi.fn(async () => makeResponse(500, 'error'));
    globalThis.fetch = fetchMock as any;

    const { getInvoiceStatus } = await import('@/lib/psp/monobank');
    await expectPspError(() => getInvoiceStatus('inv_2'), 'PSP_UNKNOWN', {
      httpStatus: 500,
    });
  });

  it('cancelInvoicePayment returns normalized response on 2xx', async () => {
    const body = JSON.stringify({ invoiceId: 'inv_3', status: 'canceled' });
    const fetchMock = vi.fn(async () => makeResponse(200, body));
    globalThis.fetch = fetchMock as any;

    const { cancelInvoicePayment } = await import('@/lib/psp/monobank');
    const result = await cancelInvoicePayment({
      invoiceId: 'inv_3',
      extRef: 'ext_3',
      amountMinor: 500,
    });
    expect(result.invoiceId).toBe('inv_3');
    expect(result.status).toBe('canceled');
  });

  it('cancelInvoicePayment maps 400 to PSP_BAD_REQUEST', async () => {
    const body = JSON.stringify({ errorCode: 'X', message: 'bad' });
    const fetchMock = vi.fn(async () => makeResponse(400, body));
    globalThis.fetch = fetchMock as any;

    const { cancelInvoicePayment } = await import('@/lib/psp/monobank');
    await expectPspError(
      () =>
        cancelInvoicePayment({
          invoiceId: 'inv_3',
          extRef: 'ext_3',
          amountMinor: 500,
        }),
      'PSP_BAD_REQUEST',
      { httpStatus: 400, monoCode: 'X' }
    );
  });

  it('cancelInvoicePayment maps 401 to PSP_AUTH_FAILED', async () => {
    const fetchMock = vi.fn(async () => makeResponse(401, 'unauthorized'));
    globalThis.fetch = fetchMock as any;

    const { cancelInvoicePayment } = await import('@/lib/psp/monobank');
    await expectPspError(
      () =>
        cancelInvoicePayment({
          invoiceId: 'inv_3',
          extRef: 'ext_3',
        }),
      'PSP_AUTH_FAILED',
      { httpStatus: 401 }
    );
  });

  it('cancelInvoicePayment maps 500 to PSP_UNKNOWN', async () => {
    const fetchMock = vi.fn(async () => makeResponse(500, 'error'));
    globalThis.fetch = fetchMock as any;

    const { cancelInvoicePayment } = await import('@/lib/psp/monobank');
    await expectPspError(
      () =>
        cancelInvoicePayment({
          invoiceId: 'inv_3',
          extRef: 'ext_3',
        }),
      'PSP_UNKNOWN',
      { httpStatus: 500 }
    );
  });

  it('removeInvoice returns normalized response on 2xx', async () => {
    const fetchMock = vi.fn(async () => makeResponse(200, ''));
    globalThis.fetch = fetchMock as any;

    const { removeInvoice } = await import('@/lib/psp/monobank');
    const result = await removeInvoice('inv_4');
    expect(result.invoiceId).toBe('inv_4');
    expect(result.removed).toBe(true);
  });

  it('removeInvoice maps 400 to PSP_BAD_REQUEST', async () => {
    const body = JSON.stringify({ errorCode: 'X', message: 'bad' });
    const fetchMock = vi.fn(async () => makeResponse(400, body));
    globalThis.fetch = fetchMock as any;

    const { removeInvoice } = await import('@/lib/psp/monobank');
    await expectPspError(() => removeInvoice('inv_4'), 'PSP_BAD_REQUEST', {
      httpStatus: 400,
      monoCode: 'X',
    });
  });

  it('removeInvoice maps 401 to PSP_AUTH_FAILED', async () => {
    const fetchMock = vi.fn(async () => makeResponse(401, 'unauthorized'));
    globalThis.fetch = fetchMock as any;

    const { removeInvoice } = await import('@/lib/psp/monobank');
    await expectPspError(() => removeInvoice('inv_4'), 'PSP_AUTH_FAILED', {
      httpStatus: 401,
    });
  });

  it('removeInvoice maps 500 to PSP_UNKNOWN', async () => {
    const fetchMock = vi.fn(async () => makeResponse(500, 'error'));
    globalThis.fetch = fetchMock as any;

    const { removeInvoice } = await import('@/lib/psp/monobank');
    await expectPspError(() => removeInvoice('inv_4'), 'PSP_UNKNOWN', {
      httpStatus: 500,
    });
  });
});
