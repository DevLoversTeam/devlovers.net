import 'server-only';

type NetlifyEnv = {
  get?: (key: string) => string | undefined;
};

function readFromNetlifyEnv(key: string): string | undefined {
  const maybeNetlify = (globalThis as { Netlify?: { env?: NetlifyEnv } }).Netlify;
  const value = maybeNetlify?.env?.get?.(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function readServerEnv(key: string): string | undefined {
  const fromProcess = process.env[key]?.trim();
  if (fromProcess) return fromProcess;
  return readFromNetlifyEnv(key);
}
