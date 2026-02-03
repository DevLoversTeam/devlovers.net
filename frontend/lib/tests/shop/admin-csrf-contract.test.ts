import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/admin', () => {
  class AdminApiDisabledError extends Error {
    code = 'ADMIN_API_DISABLED';
  }
  class AdminUnauthorizedError extends Error {
    code = 'ADMIN_UNAUTHORIZED';
  }
  class AdminForbiddenError extends Error {
    code = 'ADMIN_FORBIDDEN';
  }
  return {
    AdminApiDisabledError,
    AdminUnauthorizedError,
    AdminForbiddenError,
    requireAdminApi: vi.fn().mockResolvedValue(undefined),
  };
});

import { PATCH as patchStatus } from '@/app/api/shop/admin/products/[id]/status/route';

describe('P0-SEC: admin CSRF required for mutating endpoints', () => {
  it('admin status toggle: missing CSRF => 403 CSRF_MISSING', async () => {
    const prev = process.env.CSRF_SECRET;
    try {
      process.env.CSRF_SECRET = 'test_csrf_secret';

      const req = new NextRequest(
        new Request('http://localhost/api/shop/admin/products/x/status', {
          method: 'PATCH',
          headers: { origin: 'http://localhost:3000' },
        })
      );

      const res = await patchStatus(req, {
        params: Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' }),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('CSRF_MISSING');
    } finally {
      if (prev === undefined) {
        delete process.env.CSRF_SECRET;
      } else {
        process.env.CSRF_SECRET = prev;
      }
    }
  });
});
