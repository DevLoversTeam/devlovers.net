import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  normalizeOrigin,
  guardBrowserSameOrigin,
  guardNonBrowserOnly,
} from '@/lib/security/origin';

function makeReq(init: RequestInit) {
  return new NextRequest(new Request('http://localhost/api/test', init));
}

describe('origin posture helpers', () => {
  beforeEach(() => {
    vi.stubEnv('APP_ORIGIN', 'http://localhost:3000');
    vi.stubEnv(
      'APP_ADDITIONAL_ORIGINS',
      'https://admin.example, https://preview.example/'
    );

    vi.stubEnv('NODE_ENV', 'test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('normalizeOrigin trims and removes trailing slash', () => {
    expect(normalizeOrigin(' https://example.com/ ')).toBe(
      'https://example.com'
    );
  });

  it('guardBrowserSameOrigin allows POST with allowed Origin', () => {
    const req = makeReq({
      method: 'POST',
      headers: { origin: 'http://localhost:3000' },
    });
    const res = guardBrowserSameOrigin(req);
    expect(res).toBeNull();
  });

  it('guardBrowserSameOrigin allows POST with Origin from APP_ADDITIONAL_ORIGINS', () => {
    const req = makeReq({
      method: 'POST',
      headers: { origin: 'https://preview.example' },
    });
    const res = guardBrowserSameOrigin(req);
    expect(res).toBeNull();
  });

  it('guardBrowserSameOrigin blocks POST with missing Origin', async () => {
    const req = makeReq({ method: 'POST' });
    const res = guardBrowserSameOrigin(req);
    expect(res?.status).toBe(403);
    const body = await res?.json();
    expect(body?.error?.code).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('guardBrowserSameOrigin blocks POST with disallowed Origin', async () => {
    const req = makeReq({
      method: 'POST',
      headers: { origin: 'https://evil.example' },
    });
    const res = guardBrowserSameOrigin(req);
    expect(res?.status).toBe(403);
    const body = await res?.json();
    expect(body?.error?.code).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('guardBrowserSameOrigin allows GET without Origin', () => {
    const req = makeReq({ method: 'GET' });
    const res = guardBrowserSameOrigin(req);
    expect(res).toBeNull();
  });

  it('guardNonBrowserOnly blocks when Origin is present', async () => {
    const req = makeReq({
      method: 'POST',
      headers: { origin: 'http://localhost:3000' },
    });
    const res = guardNonBrowserOnly(req);
    expect(res?.status).toBe(403);
    const body = await res?.json();
    expect(body?.error?.code).toBe('BROWSER_CONTEXT_NOT_ALLOWED');
  });

  it('guardNonBrowserOnly blocks when Sec-Fetch-Site is same-origin', async () => {
    const req = makeReq({
      method: 'POST',
      headers: { 'sec-fetch-site': 'same-origin' },
    });
    const res = guardNonBrowserOnly(req);
    expect(res?.status).toBe(403);
    const body = await res?.json();
    expect(body?.error?.code).toBe('BROWSER_CONTEXT_NOT_ALLOWED');
  });

  it('guardNonBrowserOnly allows when no browser signals are present', () => {
    const req = makeReq({ method: 'POST' });
    const res = guardNonBrowserOnly(req);
    expect(res).toBeNull();
  });
});
