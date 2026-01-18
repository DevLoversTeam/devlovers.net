import { describe, expect, it, vi } from 'vitest';

vi.mock('@/db', () => ({ db: { execute: vi.fn() } }));

const { normalizeRateLimitSubject } = await import('@/lib/security/rate-limit');

describe('normalizeRateLimitSubject', () => {
  it('hashes IPv6 subjects without colons and is stable', () => {
    const normalized = normalizeRateLimitSubject('::1');
    const normalizedAgain = normalizeRateLimitSubject('::1');
    expect(normalized).toBe(normalizedAgain);
    expect(normalized.startsWith('ip6_')).toBe(true);
    expect(normalized.includes(':')).toBe(false);
  });

  it('leaves IPv4 subjects unchanged', () => {
    expect(normalizeRateLimitSubject('203.0.113.10')).toBe('203.0.113.10');
  });

  it('sanitizes non-IP subjects', () => {
    expect(normalizeRateLimitSubject('user:123')).toBe('user_123');
  });

  it('hashes long subjects', () => {
    const subject = 'user-' + 'x'.repeat(80);
    const normalized = normalizeRateLimitSubject(subject);
    expect(normalized).toMatch(/^h_/);
    expect(normalized).toBe(normalizeRateLimitSubject(subject));
  });
});
