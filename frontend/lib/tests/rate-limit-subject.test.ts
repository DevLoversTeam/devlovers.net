import { describe, expect, it, vi } from 'vitest';
vi.mock('@/db', () => ({ db: { execute: vi.fn() } }));

import { NextRequest } from 'next/server';
import {
  getClientIpFromHeaders,
  getRateLimitSubject,
} from '@/lib/security/rate-limit';

describe('rate limit subject', () => {
  it('returns null for x-forwarded-for in production', () => {
    const headers = new Headers({
      'x-forwarded-for': '203.0.113.10',
    });

    expect(getClientIpFromHeaders(headers, 'production')).toBeNull();
  });

  it('treats NODE_ENV with whitespace/case as production for XFF trust', () => {
    const headers = new Headers({
      'x-forwarded-for': '203.0.113.10',
    });
    expect(getClientIpFromHeaders(headers, ' production ')).toBeNull();
    expect(getClientIpFromHeaders(headers, 'PRODUCTION')).toBeNull();
  });

  it('uses first valid x-forwarded-for IP in non-production', () => {
    const headers = new Headers({
      'x-forwarded-for': 'unknown, 198.51.100.7, 203.0.113.9',
    });

    expect(getClientIpFromHeaders(headers, 'development')).toBe('198.51.100.7');
  });

  it('prefers cf-connecting-ip over other headers', () => {
    const headers = new Headers({
      'cf-connecting-ip': '203.0.113.1',
      'x-real-ip': '198.51.100.2',
      'x-forwarded-for': '198.51.100.3',
    });

    expect(getClientIpFromHeaders(headers, 'production')).toBe('203.0.113.1');
  });

  it('ignores invalid cf-connecting-ip and uses x-real-ip', () => {
    const headers = new Headers({
      'cf-connecting-ip': 'not-an-ip',
      'x-real-ip': '198.51.100.4',
    });

    expect(getClientIpFromHeaders(headers, 'production')).toBe('198.51.100.4');
  });

  it('returns clean ip6_ subject for IPv6 client ip (no ":")', () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const headers = new Headers({
        'cf-connecting-ip': '2001:db8::1',
      });
      const request = new NextRequest(
        new Request('http://localhost/test', { headers })
      );

      const subjectA = getRateLimitSubject(request);
      const subjectB = getRateLimitSubject(request);

      expect(subjectA).toBe(subjectB);
      expect(subjectA.startsWith('ip6_')).toBe(true);
      expect(subjectA.includes(':')).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('returns stable ua hash when no IP is available', () => {
    const headers = new Headers({
      'user-agent': 'Mozilla/5.0 (RateLimitTest)',
      'accept-language': 'en-US,en;q=0.9',
    });
    const request = new NextRequest(
      new Request('http://localhost/test', { headers })
    );

    const subjectA = getRateLimitSubject(request);
    const subjectB = getRateLimitSubject(request);

    expect(subjectA).toBe(subjectB);
    expect(subjectA.startsWith('ua_')).toBe(true);
    expect(subjectA.includes(':')).toBe(false);
  });
});
