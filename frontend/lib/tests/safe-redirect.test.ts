import { describe, expect, it } from 'vitest';

import { getSafeRedirect } from '@/lib/auth/safe-redirect';

describe('getSafeRedirect', () => {
  it('allows a safe internal path', () => {
    expect(getSafeRedirect('/dashboard')).toBe('/dashboard');
  });

  it('rejects duplicate returnTo query values', () => {
    expect(getSafeRedirect(['/dashboard', '/shop'])).toBe('');
  });

  it('rejects an external redirect', () => {
    expect(getSafeRedirect('https://example.com')).toBe('');
  });

  it('rejects a control-character redirect that normalizes externally', () => {
    expect(getSafeRedirect('/\n//evil.example')).toBe('');
    expect(getSafeRedirect('/\t//evil.example')).toBe('');
  });

  it('rejects a protocol-relative redirect', () => {
    expect(getSafeRedirect('//internal.invalid/path')).toBe('');
  });
});
