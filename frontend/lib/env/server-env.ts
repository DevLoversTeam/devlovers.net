import 'server-only';

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

export function readServerEnv(key: string): string | undefined {
  const fromProcess = process.env[key]?.trim();
  if (fromProcess) return fromProcess;

  return readFromNetlifyEnv(key);
}
