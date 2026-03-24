import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  sanitizeShopLogMeta,
  sanitizeShopLogString,
} from '@/lib/services/shop/logging-redaction';

describe('shop logging redaction (generic)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('LOG_LEVEL', 'debug');
    vi.stubEnv('NODE_ENV', 'test');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('redacts representative nested PII and secret-like fields while keeping operational metadata', () => {
    const safe = sanitizeShopLogMeta({
      requestId: 'req_123',
      orderId: 'ord_123',
      retryAfterSeconds: 30,
      customer: {
        email: 'buyer@example.com',
        phone: '+380501112233',
      },
      shipping: {
        addressLine1: 'Khreschatyk 1',
        addressLine2: 'Apt 4',
      },
      auth: {
        authorization: 'Bearer abc.def.ghi',
        statusToken: 'tok_secret_123',
      },
      note: 'Email buyer@example.com or call +380501112233',
    });

    expect(safe).toMatchObject({
      requestId: 'req_123',
      orderId: 'ord_123',
      retryAfterSeconds: 30,
      note: 'Email [REDACTED_EMAIL] or call [REDACTED_PHONE]',
    });
    expect((safe as Record<string, unknown>).customer).toEqual({
      email: '[REDACTED_EMAIL]',
      phone: '[REDACTED_PHONE]',
    });
    expect((safe as Record<string, unknown>).shipping).toEqual({
      addressLine1: '[REDACTED_ADDRESS]',
      addressLine2: '[REDACTED_ADDRESS]',
    });
    expect((safe as Record<string, unknown>).auth).toEqual({
      authorization: '[REDACTED_SECRET]',
      statusToken: '[REDACTED_SECRET]',
    });
  });

  it('redacts email, phone, bearer, jwt, and provider secret strings generically', () => {
    const safe = sanitizeShopLogString(
      [
        'buyer@example.com',
        '+380501112233',
        'Bearer abc.def.ghi',
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature',
        'sk_live_1234567890abcdef',
        'whsec_1234567890abcdef',
      ].join(' | ')
    );

    expect(safe).not.toContain('buyer@example.com');
    expect(safe).not.toContain('+380501112233');
    expect(safe).not.toContain('abc.def.ghi');
    expect(safe).not.toContain('sk_live_1234567890abcdef');
    expect(safe).not.toContain('whsec_1234567890abcdef');
    expect(safe).toContain('[REDACTED_EMAIL]');
    expect(safe).toContain('[REDACTED_PHONE]');
    expect(safe).toContain('Bearer [REDACTED_SECRET]');
    expect(safe).toContain('[REDACTED_SECRET]');
  });

  it('shared logger emits redacted meta and error payloads', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { logError, logWarn } = await import('@/lib/logging');

    logWarn('shop_test_warn', {
      requestId: 'req_warn',
      email: 'warn@example.com',
      shippingAddress: {
        addressLine1: 'Khreschatyk 1',
      },
      note: 'Call +380501112233',
    });
    logError(
      'shop_test_error',
      new Error('buyer@example.com +380501112233 Bearer abc.def.ghi'),
      {
        orderId: 'ord_1',
        token: 'secret_token',
      }
    );

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    const warnPayload = JSON.parse(String(warnSpy.mock.calls[0]?.[0] ?? '{}'));
    expect(warnPayload.meta).toMatchObject({
      requestId: 'req_warn',
      email: '[REDACTED_EMAIL]',
      shippingAddress: '[REDACTED_ADDRESS]',
      note: 'Call [REDACTED_PHONE]',
    });

    const errorPayload = JSON.parse(
      String(errorSpy.mock.calls[0]?.[0] ?? '{}')
    );
    expect(errorPayload.meta).toMatchObject({
      orderId: 'ord_1',
      token: '[REDACTED_SECRET]',
    });
    expect(errorPayload.err.message).toContain('[REDACTED_EMAIL]');
    expect(errorPayload.err.message).toContain('[REDACTED_PHONE]');
    expect(errorPayload.err.message).toContain('Bearer [REDACTED_SECRET]');
  });
});
