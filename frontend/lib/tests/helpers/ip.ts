/**
 * Derive a deterministic TEST IP from an idempotency key.
 * Used only in tests to make rate-limit keys stable per request.
 *
 * Produces a TEST-NET-3 IPv4 address: 203.0.113.1..250
 */
export function deriveTestIpFromIdemKey(idemKey: string): string {
  const hex = idemKey.replace(/[^0-9a-f]/gi, '').slice(0, 2);
  const n = hex ? (parseInt(hex, 16) % 250) + 1 : 1;
  return `203.0.113.${n}`;
}
