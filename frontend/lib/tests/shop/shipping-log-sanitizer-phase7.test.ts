import { describe, expect, it } from 'vitest';

import {
  sanitizeShippingErrorMessage,
  sanitizeShippingLogMeta,
} from '@/lib/services/shop/shipping/log-sanitizer';

describe('shipping log sanitizer (phase 7)', () => {
  it('redacts email and phone in error message', () => {
    const safe = sanitizeShippingErrorMessage(
      'Recipient +380501112233 john.doe@example.com failed',
      'fallback'
    );

    expect(safe).not.toContain('+380501112233');
    expect(safe).not.toContain('john.doe@example.com');
    expect(safe).toContain('[REDACTED_PHONE]');
    expect(safe).toContain('[REDACTED_EMAIL]');
  });

  it('redacts known shipping PII keys in nested metadata', () => {
    const safe = sanitizeShippingLogMeta({
      requestId: 'req-1',
      shippingAddress: {
        recipient: {
          fullName: 'Ivan Petrenko',
          phone: '+380501112233',
          email: 'ivan@example.com',
        },
        selection: {
          cityRef: 'settlement-ref-1',
          addressLine1: 'Khreschatyk 1',
        },
      },
    });

    expect(safe?.requestId).toBe('req-1');
    expect((safe as any)?.shippingAddress).toBe('[REDACTED]');
  });
});
