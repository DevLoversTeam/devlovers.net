import 'server-only';

import { getRuntimeEnv, getServerEnv } from '@/lib/env';

function toUrl(value: string, label: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new Error(`Invalid ${label} value.`);
  }
}

export function resolveShopBaseUrl(): URL {
  const env = getServerEnv();
  const raw =
    env.SHOP_BASE_URL ?? env.APP_ORIGIN ?? env.NEXT_PUBLIC_SITE_URL ?? '';

  if (!raw) {
    throw new Error(
      'SHOP_BASE_URL, APP_ORIGIN, or NEXT_PUBLIC_SITE_URL must be set.'
    );
  }

  const url = toUrl(raw, 'shop base URL');
  if (getRuntimeEnv().NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('Shop base URL must be https in production.');
  }

  return url;
}

export function toAbsoluteUrl(pathOrUrl: string): string {
  const trimmed = pathOrUrl.trim();
  if (!trimmed) {
    throw new Error('Absolute URL requires a non-empty path.');
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const url = toUrl(trimmed, 'absolute URL');
    if (
      getRuntimeEnv().NODE_ENV === 'production' &&
      url.protocol !== 'https:'
    ) {
      throw new Error('Shop base URL must be https in production.');
    }
    return url.toString();
  }

  const base = resolveShopBaseUrl();
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return new URL(path, base).toString();
}
