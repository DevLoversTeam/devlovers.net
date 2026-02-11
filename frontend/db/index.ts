import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';

import * as schema from './schema';

dotenv.config({ path: '.env', quiet: true });
dotenv.config({ path: 'frontend/.env', quiet: true });

type AppDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

const APP_ENV = process.env.APP_ENV ?? 'local';
const DATABASE_URL = process.env.DATABASE_URL;
const DATABASE_URL_LOCAL = process.env.DATABASE_URL_LOCAL;

let db: AppDatabase;

if (APP_ENV === 'local') {
  const url = DATABASE_URL_LOCAL ?? DATABASE_URL;

  if (!url) {
    throw new Error(
      '[db] APP_ENV=local requires DATABASE_URL_LOCAL or DATABASE_URL to be set'
    );
  }

  const pool = new Pool({
    connectionString: url,
  });

  db = drizzlePg(pool, { schema });

  if (process.env.NODE_ENV !== 'test') {
    console.log('[db] using local PostgreSQL (pg)');
  }
} else {
  const url = DATABASE_URL ?? DATABASE_URL_LOCAL;

  if (!url) {
    throw new Error(
      `[db] APP_ENV=${APP_ENV} requires DATABASE_URL or DATABASE_URL_LOCAL to be set`
    );
  }

  const sql = neon(url);

  db = drizzleNeon(sql, { schema });

  if (process.env.NODE_ENV !== 'test') {
    console.log('[db] using production database (neon http)');
  }
}

export { db };
