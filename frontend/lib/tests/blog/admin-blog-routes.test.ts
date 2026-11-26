import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE as deleteAuthor } from '@/app/api/admin/blog/authors/[id]/route';
import { POST as createCategory } from '@/app/api/admin/blog/categories/route';
import { POST as uploadBlogImage } from '@/app/api/admin/blog/images/route';
import { issueCsrfToken } from '@/lib/security/csrf';

const { getCurrentUser, createBlogCategory, deleteBlogAuthor, uploadImage } =
  vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    createBlogCategory: vi.fn(),
    deleteBlogAuthor: vi.fn(),
    uploadImage: vi.fn(),
  }));

vi.mock('@/lib/auth', () => ({ getCurrentUser }));
vi.mock('@/db/queries/blog/admin-blog', () => ({
  createBlogCategory,
  deleteBlogAuthor,
}));
vi.mock('@/lib/cloudinary', () => ({ uploadImage }));

const origin = 'http://localhost:3000';

function categoryRequest(body: string, headers?: HeadersInit) {
  return new NextRequest(origin + '/api/admin/blog/categories', {
    method: 'POST',
    headers,
    body,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('APP_ORIGIN', origin);
  vi.stubEnv('CSRF_SECRET', 'admin-blog-test-secret');
  vi.stubEnv('ENABLE_ADMIN_API', 'true');
  getCurrentUser.mockResolvedValue({ role: 'admin' });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('admin blog routes', () => {
  it('checks the origin before authentication or reading the body', async () => {
    const request = categoryRequest('{');
    const response = await createCategory(request);

    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      error: { code: 'ORIGIN_NOT_ALLOWED' },
    });
    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(request.bodyUsed).toBe(false);
  });

  it.each([
    { enabled: false, user: null, status: 403, code: 'ADMIN_API_DISABLED' },
    { enabled: true, user: null, status: 401, code: 'UNAUTHORIZED' },
    { enabled: true, user: { role: 'user' }, status: 403, code: 'FORBIDDEN' },
  ])(
    'maps $code before reading the body',
    async ({ enabled, user, status, code }) => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('ENABLE_ADMIN_API', String(enabled));
      getCurrentUser.mockResolvedValue(user);
      const request = categoryRequest('{', { origin });
      const response = await createCategory(request);

      expect(response.status).toBe(status);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({ code });
      expect(request.bodyUsed).toBe(false);
    }
  );

  it('checks CSRF before reading JSON', async () => {
    const request = categoryRequest('{', { origin });
    const response = await createCategory(request);

    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ code: 'CSRF_MISSING' });
    expect(request.bodyUsed).toBe(false);
  });

  it('returns 400 INVALID_BODY for malformed JSON', async () => {
    const response = await createCategory(
      categoryRequest('{', {
        origin,
        'x-csrf-token': issueCsrfToken('admin:blog-category:create'),
      })
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      error: 'Invalid JSON body',
      code: 'INVALID_BODY',
    });
    expect(createBlogCategory).not.toHaveBeenCalled();
  });

  it('passes valid JSON through to the route schema', async () => {
    const response = await createCategory(
      categoryRequest('null', {
        origin,
        'x-csrf-token': issueCsrfToken('admin:blog-category:create'),
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'INVALID_PAYLOAD' });
    expect(createBlogCategory).not.toHaveBeenCalled();
  });

  it('returns the form data error for a malformed image request', async () => {
    const response = await uploadBlogImage(
      new NextRequest(origin + '/api/admin/blog/images', {
        method: 'POST',
        headers: { origin, 'content-type': 'multipart/form-data' },
        body: 'malformed',
      })
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      error: 'Invalid form data',
      code: 'INVALID_BODY',
    });
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it('returns a conflict when deleting an author with posts', async () => {
    deleteBlogAuthor.mockRejectedValue(new Error('AUTHOR_HAS_POSTS'));
    const response = await deleteAuthor(
      new NextRequest(origin + '/api/admin/blog/authors/author-id', {
        method: 'DELETE',
        headers: {
          origin,
          'x-csrf-token': issueCsrfToken('admin:blog-author:delete'),
        },
      }),
      { params: Promise.resolve({ id: 'author-id' }) }
    );

    expect(response.status).toBe(409);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      error: 'Author has posts assigned',
      code: 'HAS_POSTS',
    });
  });
});
