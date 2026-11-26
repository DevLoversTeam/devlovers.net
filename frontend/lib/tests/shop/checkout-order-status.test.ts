import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchCheckoutOrderStatus,
  getCheckoutOrderStatusErrorCode,
} from '@/lib/shop/checkout-order-status';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('checkout order status request', () => {
  it('encodes the order ID and token and passes through the abort signal', async () => {
    const signal = new AbortController().signal;
    const payload = { paymentStatus: 'paid' };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json(payload));

    await expect(
      fetchCheckoutOrderStatus({
        orderId: 'order/1',
        statusToken: 'token+/=',
        signal,
      })
    ).resolves.toEqual({ ok: true, status: 200, payload });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/shop/orders/order%2F1/status?view=lite&statusToken=token%2B%2F%3D',
      {
        method: 'GET',
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-store' },
        credentials: 'same-origin',
        signal,
      }
    );
  });

  it('omits absent tokens and preserves the HTTP status for malformed JSON', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('invalid JSON', { status: 403 }));

    await expect(
      fetchCheckoutOrderStatus({
        orderId: 'order',
        statusToken: null,
        headers: { Accept: 'application/json' },
      })
    ).resolves.toEqual({ ok: false, status: 403, payload: null });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/shop/orders/order/status?view=lite',
      expect.objectContaining({
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      })
    );
  });

  it('propagates fetch failures to the caller', async () => {
    const error = new DOMException('Cancelled', 'AbortError');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(error);

    await expect(
      fetchCheckoutOrderStatus({ orderId: 'order', statusToken: null })
    ).rejects.toBe(error);
  });

  it('reads the server error code or uses the default', () => {
    expect(getCheckoutOrderStatusErrorCode({ code: ' FORBIDDEN ' })).toBe(
      'FORBIDDEN'
    );
    expect(getCheckoutOrderStatusErrorCode({ code: ' ' })).toBe(
      'INTERNAL_ERROR'
    );
    expect(getCheckoutOrderStatusErrorCode(null)).toBe('INTERNAL_ERROR');
  });
});
