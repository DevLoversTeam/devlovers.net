export function deriveTestIpFromIdemKey(idemKey: string): string {
  const hex = idemKey.replace(/[^0-9a-f]/gi, '').slice(0, 2);
  const n = hex ? (parseInt(hex, 16) % 250) + 1 : 1;
  return `203.0.113.${n}`;
}
