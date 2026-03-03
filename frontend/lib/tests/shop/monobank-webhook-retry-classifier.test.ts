import { describe, expect, it } from 'vitest';

import { InvalidPayloadError } from '@/lib/services/errors';
import {
  getMonobankApplyErrorCode,
  isRetryableApplyError,
} from '@/lib/services/orders/monobank-retry';

describe('monobank webhook retry classifier', () => {
  it('InvalidPayloadError is non-retryable', () => {
    const err = new InvalidPayloadError('bad payload', {
      code: 'INVALID_PAYLOAD',
    });
    expect(isRetryableApplyError(err)).toBe(false);
  });

  it('ORDER_NOT_FOUND code is non-retryable', () => {
    const err = { code: 'ORDER_NOT_FOUND' };
    expect(isRetryableApplyError(err)).toBe(false);
  });

  it('known code outside transient whitelist is non-retryable (fail-closed)', () => {
    const err = { code: 'SOME_UNKNOWN_KNOWN_CODE' };
    expect(isRetryableApplyError(err)).toBe(false);
  });

  it('error without code is retryable', () => {
    const err = new Error('temporary failure');
    expect(getMonobankApplyErrorCode(err)).toBeNull();
    expect(isRetryableApplyError(err)).toBe(true);
  });

  it('transient whitelist code is retryable', () => {
    const err = { code: 'PSP_TIMEOUT' };
    expect(isRetryableApplyError(err)).toBe(true);
  });
});
