export async function fetchCheckoutOrderStatus({
  orderId,
  statusToken,
  signal,
  headers = { 'Cache-Control': 'no-store' },
}: {
  orderId: string;
  statusToken: string | null;
  signal?: AbortSignal;
  headers?: HeadersInit;
}) {
  const query = new URLSearchParams({ view: 'lite' });
  if (statusToken) query.set('statusToken', statusToken);

  const response = await fetch(
    `/api/shop/orders/${encodeURIComponent(orderId)}/status?${query}`,
    {
      method: 'GET',
      cache: 'no-store',
      headers,
      credentials: 'same-origin',
      signal,
    }
  );
  const payload: unknown = await response.json().catch(() => null);

  return { ok: response.ok, status: response.status, payload };
}

export function getCheckoutOrderStatusErrorCode(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'INTERNAL_ERROR';
  const code = (payload as Record<string, unknown>).code;
  return (typeof code === 'string' && code.trim()) || 'INTERNAL_ERROR';
}
