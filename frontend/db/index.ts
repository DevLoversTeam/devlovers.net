import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';

import * as schema from './schema';

dotenv.config();

type AppDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

const APP_ENV = process.env.APP_ENV ?? 'local';
const STRICT_LOCAL_DB_GUARD = process.env.SHOP_STRICT_LOCAL_DB === '1';
const REQUIRED_LOCAL_DB_URL = process.env.SHOP_REQUIRED_DATABASE_URL_LOCAL;

if (STRICT_LOCAL_DB_GUARD) {
  if (APP_ENV !== 'local') {
    throw new Error(
      `[db] SHOP_STRICT_LOCAL_DB=1 requires APP_ENV=local (got "${APP_ENV}")`
    );
  }
  if (!process.env.DATABASE_URL_LOCAL?.trim()) {
    throw new Error(
      '[db] SHOP_STRICT_LOCAL_DB=1 requires DATABASE_URL_LOCAL to be set'
    );
  }
  if (process.env.DATABASE_URL?.trim()) {
    throw new Error(
      '[db] SHOP_STRICT_LOCAL_DB=1 forbids DATABASE_URL during shop-local tests'
    );
  }
  if (
    REQUIRED_LOCAL_DB_URL &&
    process.env.DATABASE_URL_LOCAL !== REQUIRED_LOCAL_DB_URL
  ) {
    throw new Error(
      '[db] SHOP_STRICT_LOCAL_DB=1 requires DATABASE_URL_LOCAL to match SHOP_REQUIRED_DATABASE_URL_LOCAL exactly'
    );
  }
}

let db: AppDatabase;

if (APP_ENV === 'local') {
  const url = process.env.DATABASE_URL_LOCAL;

  if (!url) {
    throw new Error('[db] APP_ENV=local requires DATABASE_URL_LOCAL to be set');
  }

  const pool = new Pool({
    connectionString: url,
  });

  db = drizzlePg(pool, { schema });

  if (process.env.NODE_ENV !== 'test') {
    console.log('[db] using local PostgreSQL (pg)');
  }
} else {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(`[db] APP_ENV=${APP_ENV} requires DATABASE_URL to be set`);
  }

  const sql = neon(url);

  db = drizzleNeon(sql, { schema });

  if (process.env.NODE_ENV !== 'test') {
    console.log('[db] using production database (neon http)');
  }
}

export { db };
