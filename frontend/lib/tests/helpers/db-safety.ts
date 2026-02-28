export function assertNotProductionDb(): void {
  if (process.env.ALLOW_PROD_DB_TESTS === '1') {
    return;
  }

  const appEnv = (process.env.APP_ENV ?? 'local').toLowerCase();
  const databaseUrl = process.env.DATABASE_URL ?? '';
  const databaseUrlLocal = process.env.DATABASE_URL_LOCAL ?? '';
  const strictLocal = process.env.SHOP_STRICT_LOCAL_DB === '1';
  const requiredLocal = process.env.SHOP_REQUIRED_DATABASE_URL_LOCAL ?? '';

  const reasons: string[] = [];

  if (appEnv !== 'local') {
    reasons.push(`APP_ENV=${appEnv}`);
  }

  if (/neon\.tech/i.test(databaseUrl) || /production/i.test(databaseUrl)) {
    reasons.push('DATABASE_URL looks production-like');
  }

  if (
    /neon\.tech/i.test(databaseUrlLocal) ||
    /production/i.test(databaseUrlLocal)
  ) {
    reasons.push('DATABASE_URL_LOCAL looks production-like');
  }

  if (strictLocal && databaseUrl.trim()) {
    reasons.push('DATABASE_URL must be unset when SHOP_STRICT_LOCAL_DB=1');
  }

  if (strictLocal && !databaseUrlLocal.trim()) {
    reasons.push(
      'DATABASE_URL_LOCAL must be set when SHOP_STRICT_LOCAL_DB=1'
    );
  }

  if (strictLocal && requiredLocal && databaseUrlLocal !== requiredLocal) {
    reasons.push(
      'DATABASE_URL_LOCAL must match SHOP_REQUIRED_DATABASE_URL_LOCAL exactly'
    );
  }

  if (reasons.length > 0) {
    throw new Error(
      `[db-safety] Refusing DB-mutating tests against production-like DB config. Reasons: ${reasons.join(
        '; '
      )}. Set ALLOW_PROD_DB_TESTS=1 only for intentional local debugging.`
    );
  }
}
