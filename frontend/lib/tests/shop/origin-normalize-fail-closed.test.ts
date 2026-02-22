import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getAllowedOrigins,
  guardBrowserSameOrigin,
  normalizeOrigin,
} from '@/lib/security/origin';

function makeReq(origin: string, method: string = 'POST') {
  return new NextRequest('http://localhost/test', {
    method,
    headers: { origin },
  });
}

describe('origin normalize fail-closed (P1)', () => {
  const originalAppOrigin = process.env.APP_ORIGIN;
  const originalAdditional = process.env.APP_ADDITIONAL_ORIGINS;

  beforeEach(() => {
    delete process.env.APP_ORIGIN;
    delete process.env.APP_ADDITIONAL_ORIGINS;
  });

  afterEach(() => {
    if (originalAppOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = originalAppOrigin;

    if (originalAdditional === undefined)
      delete process.env.APP_ADDITIONAL_ORIGINS;
    else process.env.APP_ADDITIONAL_ORIGINS = originalAdditional;
  });

  it('malformed origin normalizes to empty string', () => {
    expect(normalizeOrigin('not a url')).toBe('');
    expect(normalizeOrigin('   not a url   ')).toBe('');
  });

  it('malformed origin does not pass allow-list (guard blocks)', async () => {
    const res = guardBrowserSameOrigin(makeReq('not a url'));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);

    const body = await res!.json();
    expect(body?.error?.code).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('valid origins compare stably (trailing slashes/case)', () => {
    const allowed = getAllowedOrigins();
    expect(allowed).toContain('http://localhost:3000');

    const res = guardBrowserSameOrigin(makeReq('http://LOCALHOST:3000///'));
    expect(res).toBeNull();
  });

  it('invalid APP_ORIGIN does not add empty string to allowed origins', () => {
    process.env.APP_ORIGIN = 'not a url';
    const allowed = getAllowedOrigins();
    expect(allowed).not.toContain('');
  });
});
