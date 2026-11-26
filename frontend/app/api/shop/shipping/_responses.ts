import { NextResponse } from 'next/server';

import { noStoreJson } from '@/lib/http/noStoreJson';

const cacheControl = {
  methods: 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
  lookup: 'public, max-age=30, s-maxage=60, stale-while-revalidate=120',
} as const;

export function cachedShippingJson(
  body: unknown,
  requestId: string,
  policy: keyof typeof cacheControl
) {
  const response = NextResponse.json(body, { status: 200 });
  response.headers.set('Cache-Control', cacheControl[policy]);
  response.headers.set('X-Request-Id', requestId);
  return response;
}

export function noStoreShippingJson(
  body: unknown,
  requestId: string,
  status = 200
) {
  const response = noStoreJson(body, { status });
  response.headers.set('X-Request-Id', requestId);
  return response;
}
