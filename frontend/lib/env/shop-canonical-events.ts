import 'server-only';

function normalizedFlag(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function isCanonicalEventsDualWriteEnabled(): boolean {
  const raw = normalizedFlag(process.env.SHOP_CANONICAL_EVENTS_DUAL_WRITE);
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}

