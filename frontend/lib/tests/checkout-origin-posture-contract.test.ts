import { describe, it, expect } from 'vitest';
import { POST } from '@/app/api/shop/checkout/route';
import { makeCheckoutReq } from '@/lib/tests/helpers/makeCheckoutReq';

describe('checkout origin posture contract', () => {
  it('blocks POST without Origin header', async () => {
    const req = makeCheckoutReq({
      idempotencyKey: 'idem_origin_missing_0001',
      origin: null,
    });

    const res = await POST(req);

    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body?.error?.code).toBe('ORIGIN_NOT_ALLOWED');
  });
});
