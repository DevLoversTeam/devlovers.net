import { describe, expect, it, vi, afterEach } from 'vitest';
vi.mock('@/db', () => ({ db: { execute: vi.fn() } }));

import { NextRequest } from 'next/server';
import {
  getClientIpFromHeaders,
  getRateLimitSubject,
} from '@/lib/security/rate-limit';

const prevTrust = process.env.TRUST_FORWARDED_HEADERS;

afterEach(() => {
  process.env.TRUST_FORWARDED_HEADERS = prevTrust;
});

describe('rate limit subject', () => {
  it('returns null for x-forwarded-for when TRUST_FORWARDED_HEADERS is false', () => {
    process.env.TRUST_FORWARDED_HEADERS = '0';

    const headers = new Headers({
      'x-forwarded-for': '203.0.113.10',
    });

    expect(getClientIpFromHeaders(headers)).toBeNull();
  });

  it('returns null for x-real-ip when TRUST_FORWARDED_HEADERS is false', () => {
    process.env.TRUST_FORWARDED_HEADERS = 'false';

    const headers = new Headers({
      'x-real-ip': '198.51.100.4',
    });

    expect(getClientIpFromHeaders(headers)).toBeNull();
  });

  it('uses first valid x-forwarded-for IP when TRUST_FORWARDED_HEADERS is true', () => {
    process.env.TRUST_FORWARDED_HEADERS = '1';

    const headers = new Headers({
      'x-forwarded-for': 'unknown, 198.51.100.7, 203.0.113.9',
    });

    expect(getClientIpFromHeaders(headers)).toBe('198.51.100.7');
  });

  it('prefers cf-connecting-ip over other headers (even when trust is true)', () => {
    process.env.TRUST_FORWARDED_HEADERS = '1';

    const headers = new Headers({
      'cf-connecting-ip': '203.0.113.1',
      'x-real-ip': '198.51.100.2',
      'x-forwarded-for': '198.51.100.3',
    });

    expect(getClientIpFromHeaders(headers)).toBe('203.0.113.1');
  });

  it('ignores invalid cf-connecting-ip and falls back to null when trust is false', () => {
    process.env.TRUST_FORWARDED_HEADERS = '0';

    const headers = new Headers({
      'cf-connecting-ip': 'not-an-ip',
      'x-real-ip': '198.51.100.4',
    });

    // cf invalid; trust disabled => must NOT accept x-real-ip
    expect(getClientIpFromHeaders(headers)).toBeNull();
  });

  it('ignores invalid cf-connecting-ip and uses x-real-ip when trust is true', () => {
    process.env.TRUST_FORWARDED_HEADERS = 'true';

    const headers = new Headers({
      'cf-connecting-ip': 'not-an-ip',
      'x-real-ip': '198.51.100.4',
    });

    expect(getClientIpFromHeaders(headers)).toBe('198.51.100.4');
  });

  it('returns clean ip6_ subject for IPv6 client ip (no ":")', () => {
    process.env.TRUST_FORWARDED_HEADERS = '0';

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
  });

  it('returns stable ua hash when no IP is available', () => {
    process.env.TRUST_FORWARDED_HEADERS = '0';

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
