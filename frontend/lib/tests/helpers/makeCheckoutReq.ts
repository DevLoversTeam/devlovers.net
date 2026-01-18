import { NextRequest } from 'next/server';

export type CheckoutItemInput = {
  productId: string;
  quantity: number;
  selectedSize?: string;
  selectedColor?: string;
};

function deriveTestIpFromIdemKey(idemKey: string): string {
  // беремо перші 2 hex-символи, робимо байт 1..250
  const hex = idemKey.replace(/[^0-9a-f]/gi, '').slice(0, 2);
  const n = hex ? (parseInt(hex, 16) % 250) + 1 : 1;
  return `203.0.113.${n}`; // TEST-NET-3
}

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
