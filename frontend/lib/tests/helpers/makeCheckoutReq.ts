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
  locale?: string; // mapped to Accept-Language
  items?: CheckoutItemInput[];
  userId?: string;
}) {
  const locale = params.locale ?? 'en';
  const idemKey = params.idempotencyKey;

  const items = params.items ?? [
    {
      productId: '11111111-1111-4111-8111-111111111111',
      quantity: 1,
      // IMPORTANT: не форсимо selectedSize/selectedColor
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

  const headers = new Headers({
    'content-type': 'application/json',
    'accept-language': locale,
    'idempotency-key': idemKey,
    'x-forwarded-for': deriveTestIpFromIdemKey(idemKey),
  });

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
