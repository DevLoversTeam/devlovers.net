import { NextRequest } from 'next/server';

type CheckoutItemInput = {
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

  const items = params.items ?? [
    {
      productId: '11111111-1111-4111-8111-111111111111',
      quantity: 1,
      // IMPORTANT:
      // do NOT force selectedSize/selectedColor unless explicitly provided.
      // Empty strings often fail schema validation (min(1) etc).
    },
  ];

  const payloadItems = items.map(i => {
    const base: Record<string, unknown> = {
      productId: i.productId,
      quantity: i.quantity,
    };

    // Include variant fields only if caller provided them (including empty string intentionally).
    if (i.selectedSize !== undefined) base.selectedSize = i.selectedSize;
    if (i.selectedColor !== undefined) base.selectedColor = i.selectedColor;

    return base;
  });

  const headers = new Headers({
    'Content-Type': 'application/json',
    'Idempotency-Key': params.idempotencyKey,
    'Accept-Language': locale,
  });

  const req = new Request('http://localhost/api/shop/checkout', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      items: payloadItems,
      ...(params.userId ? { userId: params.userId } : {}),
    }),
  });

  // Wrap the real Request to ensure body is readable by request.text() in route
  return new NextRequest(req);
}
