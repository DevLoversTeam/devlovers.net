import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  guardBrowserSameOrigin,
  guardNonBrowserFailClosed,
  guardNonBrowserOnly,
  normalizeOrigin,
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

  it('guardNonBrowserFailClosed blocks when Referer is present', async () => {
    const req = makeReq({
      method: 'POST',
      headers: { referer: 'http://localhost:3000/shop' },
    });
    const res = guardNonBrowserFailClosed(req, { surface: 'test_surface' });
    expect(res?.status).toBe(403);
    const body = await res?.json();
    expect(body).toMatchObject({
      success: false,
      code: 'ORIGIN_BLOCKED',
      surface: 'test_surface',
    });
    expect(res?.headers.get('Cache-Control')).toBe('no-store');
  });

  it('guardNonBrowserFailClosed blocks when Sec-Fetch-* headers are present', async () => {
    const req = makeReq({
      method: 'POST',
      headers: { 'sec-fetch-site': 'none' },
    });
    const res = guardNonBrowserFailClosed(req, { surface: 'test_surface' });
    expect(res?.status).toBe(403);
    const body = await res?.json();
    expect(body?.code).toBe('ORIGIN_BLOCKED');
  });

  it('guardNonBrowserFailClosed allows when no browser signals are present', () => {
    const req = makeReq({ method: 'POST' });
    const res = guardNonBrowserFailClosed(req, { surface: 'test_surface' });
    expect(res).toBeNull();
  });
});
