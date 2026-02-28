import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isCanonicalEventsDualWriteEnabled } from '@/lib/env/shop-canonical-events';

const ENV_KEYS = [
  'SHOP_CANONICAL_EVENTS_DUAL_WRITE',
  'APP_ENV',
  'NODE_ENV',
] as const;

const previousEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    previousEnv[key] = process.env[key];
  }
  process.env.APP_ENV = 'local';
  process.env.NODE_ENV = 'test';
  delete process.env.SHOP_CANONICAL_EVENTS_DUAL_WRITE;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const prev = previousEnv[key];
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
});

describe('shop canonical events env policy', () => {
  it('defaults to enabled when env is unset', () => {
    expect(isCanonicalEventsDualWriteEnabled()).toBe(true);
  });

  it('allows explicit enable values', () => {
    process.env.SHOP_CANONICAL_EVENTS_DUAL_WRITE = 'true';
    expect(isCanonicalEventsDualWriteEnabled()).toBe(true);
  });

  it('allows explicit disable only in non-production runtime', () => {
    process.env.APP_ENV = 'local';
    process.env.NODE_ENV = 'test';
    process.env.SHOP_CANONICAL_EVENTS_DUAL_WRITE = 'off';

    expect(isCanonicalEventsDualWriteEnabled()).toBe(false);
  });

  it('throws in production runtime when explicit disable is set', () => {
    process.env.APP_ENV = 'local';
    process.env.NODE_ENV = 'production';
    process.env.SHOP_CANONICAL_EVENTS_DUAL_WRITE = 'false';

    expect(() => isCanonicalEventsDualWriteEnabled()).toThrow(
      'cannot be disabled in production'
    );
  });

  it('throws on invalid value', () => {
    process.env.SHOP_CANONICAL_EVENTS_DUAL_WRITE = 'sometimes';

    expect(() => isCanonicalEventsDualWriteEnabled()).toThrow(
      'Invalid SHOP_CANONICAL_EVENTS_DUAL_WRITE value'
    );
  });
});
