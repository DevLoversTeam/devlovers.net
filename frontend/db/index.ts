import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as dotenv from 'dotenv';

import * as schema from './schema';

dotenv.config();

function resolveDatabaseUrl(): string {
  const context = process.env.CONTEXT || process.env.NETLIFY_CONTEXT;
  const isPreview = context === 'deploy-preview' || context === 'branch-deploy';

  if (isPreview) {
    if (!process.env.DATABASE_URL_PREVIEW) {
      throw new Error('DATABASE_URL_PREVIEW is missing for preview deploys');
    }
    return process.env.DATABASE_URL_PREVIEW;
  }

  if (process.env.NODE_ENV === 'development' && process.env.DATABASE_URL_DEV) {
    return process.env.DATABASE_URL_DEV;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing');
  }

  return process.env.DATABASE_URL;
}

const sql = neon(resolveDatabaseUrl());

export const db = drizzle(sql, { schema });
