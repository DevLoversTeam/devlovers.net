export function assertNotProductionDb(): void {
  if (process.env.ALLOW_PROD_DB_TESTS === '1') {
    return;
  }

  const appEnv = (process.env.APP_ENV ?? 'local').toLowerCase();
  const databaseUrl = process.env.DATABASE_URL ?? '';
  const databaseUrlLocal = process.env.DATABASE_URL_LOCAL ?? '';

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

  if (reasons.length > 0) {
    throw new Error(
      `[db-safety] Refusing DB-mutating tests against production-like DB config. Reasons: ${reasons.join(
        '; '
      )}. Set ALLOW_PROD_DB_TESTS=1 only for intentional local debugging.`
    );
  }
}
