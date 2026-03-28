import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';

import { readServerEnv } from '@/lib/env/server-env';

import * as schema from './schema';


type AppDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

const APP_ENV = readServerEnv('APP_ENV')?.toLowerCase();

const DATABASE_URL = readServerEnv('DATABASE_URL');
const DATABASE_URL_LOCAL = readServerEnv('DATABASE_URL_LOCAL');
const IS_LOCAL_ENV = APP_ENV === 'local';

const STRICT_LOCAL_DB_GUARD = readServerEnv('SHOP_STRICT_LOCAL_DB') === '1';
const REQUIRED_LOCAL_DB_URL = readServerEnv('SHOP_REQUIRED_DATABASE_URL_LOCAL');

if (process.env.NODE_ENV !== 'test') {
  console.log('[db] runtime env check', {
    APP_ENV: APP_ENV ?? '<undefined>',
    has_DATABASE_URL: Boolean(DATABASE_URL),
    has_DATABASE_URL_LOCAL: Boolean(DATABASE_URL_LOCAL),
    NETLIFY: readServerEnv('NETLIFY') ?? '<undefined>',
    CONTEXT: readServerEnv('CONTEXT') ?? '<undefined>',
    NODE_ENV: process.env.NODE_ENV ?? '<undefined>',
  });
}


if (STRICT_LOCAL_DB_GUARD) {
  if (!IS_LOCAL_ENV) {
    throw new Error(
      `[db] SHOP_STRICT_LOCAL_DB=1 requires APP_ENV=local (got "${APP_ENV}")`
    );
  }

  if (!DATABASE_URL_LOCAL) {
    throw new Error(
      '[db] SHOP_STRICT_LOCAL_DB=1 requires DATABASE_URL_LOCAL to be set'
    );
  }

  if (DATABASE_URL) {
    throw new Error(
      '[db] SHOP_STRICT_LOCAL_DB=1 forbids DATABASE_URL during shop-local tests'
    );
  }

  if (
    REQUIRED_LOCAL_DB_URL &&
    DATABASE_URL_LOCAL !== REQUIRED_LOCAL_DB_URL
  ) {
    throw new Error(
      '[db] SHOP_STRICT_LOCAL_DB=1 requires DATABASE_URL_LOCAL to match SHOP_REQUIRED_DATABASE_URL_LOCAL exactly'
    );
  }
}

let db: AppDatabase;

if (DATABASE_URL) {
  const sql = neon(DATABASE_URL);
  db = drizzleNeon(sql, { schema });

  if (process.env.NODE_ENV !== 'test') {
    console.log('[db] using production database (neon http)');
  }
} else if (IS_LOCAL_ENV) {
  if (!DATABASE_URL_LOCAL) {
    throw new Error('[db] APP_ENV=local requires DATABASE_URL_LOCAL to be set');
  }

  const pool = new Pool({ connectionString: DATABASE_URL_LOCAL });
  db = drizzlePg(pool, { schema });

  if (process.env.NODE_ENV !== 'test') {
    console.log('[db] using local PostgreSQL (pg)');
  }
} else {
  throw new Error(
    `[db] no usable database configuration found (APP_ENV=${APP_ENV ?? 'undefined'})`
  );
}


export { db };
