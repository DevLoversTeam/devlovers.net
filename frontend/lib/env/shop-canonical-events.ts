import 'server-only';

function normalizedFlag(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function isProductionRuntime(): boolean {
  const appEnv = normalizedFlag(process.env.APP_ENV);
  const nodeEnv = normalizedFlag(process.env.NODE_ENV);
  return appEnv === 'production' || nodeEnv === 'production';
}

export function isCanonicalEventsDualWriteEnabled(): boolean {
  const raw = normalizedFlag(process.env.SHOP_CANONICAL_EVENTS_DUAL_WRITE);

  if (!raw) {
    return true;
  }

  if (raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on') {
    return true;
  }

  if (raw === 'false' || raw === '0' || raw === 'no' || raw === 'off') {
    if (isProductionRuntime()) {
      throw new Error(
        'SHOP_CANONICAL_EVENTS_DUAL_WRITE cannot be disabled in production.'
      );
    }
    return false;
  }

  throw new Error(
    `Invalid SHOP_CANONICAL_EVENTS_DUAL_WRITE value: "${process.env.SHOP_CANONICAL_EVENTS_DUAL_WRITE ?? ''}".`
  );
}
