import { beforeAll, beforeEach } from 'vitest';

import { assertNotProductionDb } from '@/lib/tests/helpers/db-safety';

const REQUIRED_LOCAL_DB_URL =
  'postgresql://devlovers_local:Gfdtkk43@localhost:5432/devlovers_shop_local_clean?sslmode=disable';

function assertStrictShopLocalDb() {
  const appEnv = (process.env.APP_ENV ?? '').trim().toLowerCase();
  const localDb = (process.env.DATABASE_URL_LOCAL ?? '').trim();
  const dbUrl = (process.env.DATABASE_URL ?? '').trim();

  if (appEnv !== 'local') {
    throw new Error(
      `[shop-test-preflight] APP_ENV must be "local" (got "${appEnv || '<empty>'}").`
    );
  }

  if (!localDb) {
    throw new Error(
      '[shop-test-preflight] DATABASE_URL_LOCAL must be set for shop tests.'
    );
  }

  if (localDb !== REQUIRED_LOCAL_DB_URL) {
    throw new Error(
      '[shop-test-preflight] DATABASE_URL_LOCAL must match the required local shop DSN exactly.'
    );
  }

  if (dbUrl) {
    throw new Error(
      '[shop-test-preflight] DATABASE_URL must be unset for shop tests.'
    );
  }
}

beforeAll(() => {
  process.env.SHOP_STRICT_LOCAL_DB = '1';
  process.env.SHOP_REQUIRED_DATABASE_URL_LOCAL = REQUIRED_LOCAL_DB_URL;
  assertStrictShopLocalDb();
  assertNotProductionDb();
});

beforeEach(() => {
  assertStrictShopLocalDb();
  assertNotProductionDb();
});
