import 'server-only';

import { RUNTIME_ENV } from './runtime-env.generated';

type NetlifyEnv = {
  get?: (key: string) => string | undefined;
};

type NetlifyRuntime = {
  env?: NetlifyEnv;
};

declare const Netlify: NetlifyRuntime | undefined;

function getNetlifyRuntime(): NetlifyRuntime | undefined {
  const fromGlobalThis = (globalThis as { Netlify?: NetlifyRuntime }).Netlify;
  if (fromGlobalThis) return fromGlobalThis;

  if (typeof Netlify !== 'undefined') return Netlify;

  return undefined;
}

function readFromNetlifyEnv(key: string): string | undefined {
  const runtime = getNetlifyRuntime();
  const value = runtime?.env?.get?.(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

const GENERATED_FALLBACK_KEYS = new Set([
  'APP_ENV',
  'CONTEXT',
  'NETLIFY',
  'DATABASE_URL',
  'DATABASE_URL_LOCAL',
  'AUTH_SECRET',
  'CSRF_SECRET',
  'GOOGLE_CLIENT_ID_DEVELOP',
  'GOOGLE_CLIENT_SECRET_DEVELOP',
  'GOOGLE_CLIENT_REDIRECT_URI_DEVELOP',
  'GITHUB_CLIENT_ID_DEVELOP',
  'GITHUB_CLIENT_SECRET_DEVELOP',
  'GITHUB_CLIENT_REDIRECT_URI_DEVELOP',
  'ENABLE_ADMIN_API',
  'NEXT_PUBLIC_ENABLE_ADMIN',
  'SHOP_STATUS_TOKEN_SECRET',
  'APP_ORIGIN',
  'APP_ADDITIONAL_ORIGINS',
  'GMAIL_USER',
  'GMAIL_APP_PASSWORD',
  'EMAIL_FROM',
]);


function canUseGeneratedFallback(key: string): boolean {
  return GENERATED_FALLBACK_KEYS.has(key);
}

export function readServerEnv(key: string): string | undefined {
  const fromProcess = process.env[key]?.trim();
  if (fromProcess) return fromProcess;

  const fromNetlify = readFromNetlifyEnv(key);
  if (fromNetlify) return fromNetlify;

 if (!canUseGeneratedFallback(key)) return undefined;
 return readFromGeneratedRuntimeEnv(key);

}

function readFromGeneratedRuntimeEnv(key: string): string | undefined {
  const value = RUNTIME_ENV[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}