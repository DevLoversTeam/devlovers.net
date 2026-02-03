import { NextRequest } from 'next/server';

import { deriveTestIpFromIdemKey } from '@/lib/tests/helpers/ip';

export type CheckoutItemInput = {
  productId: string;
  quantity: number;
  selectedSize?: string;
  selectedColor?: string;
};

export function makeCheckoutReq(params: {
  idempotencyKey: string;
  locale?: string;
  items?: CheckoutItemInput[];
  userId?: string;
  origin?: string | null;
}) {
  const locale = params.locale ?? 'en';
  const idemKey = params.idempotencyKey;
  const origin =
    params.origin === undefined ? 'http://localhost:3000' : params.origin;

  const items = params.items ?? [
    {
      productId: '11111111-1111-4111-8111-111111111111',
      quantity: 1,
    },
  ];

  const payloadItems = items.map(i => {
    const base: Record<string, unknown> = {
      productId: i.productId,
      quantity: i.quantity,
    };
    if (i.selectedSize !== undefined) base.selectedSize = i.selectedSize;
    if (i.selectedColor !== undefined) base.selectedColor = i.selectedColor;
    return base;
  });
  const ip = deriveTestIpFromIdemKey(idemKey);

  const headers = new Headers({
    'content-type': 'application/json',
    'accept-language': locale,
    'idempotency-key': idemKey,
    'x-forwarded-for': ip,
    'x-real-ip': ip,
  });
  if (origin) {
    headers.set('origin', origin);
  }

  const req = new Request('http://localhost/api/shop/checkout', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      items: payloadItems,
      ...(params.userId ? { userId: params.userId } : {}),
    }),
  });

  return new NextRequest(req);
}
