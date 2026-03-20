import { NextRequest, NextResponse } from 'next/server';

import {
  AdminApiDisabledError,
  AdminForbiddenError,
  AdminUnauthorizedError,
  requireAdminApi,
} from '@/lib/auth/admin';
import { uploadImage } from '@/lib/cloudinary';
import { logError } from '@/lib/logging';
import { requireAdminCsrf } from '@/lib/security/admin-csrf';
import { guardBrowserSameOrigin } from '@/lib/security/origin';

export const runtime = 'nodejs';

function noStoreJson(body: unknown, init?: { status?: number }) {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const blocked = guardBrowserSameOrigin(request);
  if (blocked) {
    blocked.headers.set('Cache-Control', 'no-store');
    return blocked;
  }

  try {
    await requireAdminApi(request);

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return noStoreJson(
        { error: 'Invalid form data', code: 'INVALID_BODY' },
        { status: 400 }
      );
    }

    const csrfResult = requireAdminCsrf(
      request,
      'admin:blog:image',
      formData
    );
    if (csrfResult) {
      csrfResult.headers.set('Cache-Control', 'no-store');
      return csrfResult;
    }

    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return noStoreJson(
        { error: 'File is required', code: 'MISSING_FILE' },
        { status: 400 }
      );
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return noStoreJson(
        { error: 'File too large (max 5 MB)', code: 'FILE_TOO_LARGE' },
        { status: 400 }
      );
    }

    const result = await uploadImage(file, { folder: 'blog/posts' });

    return noStoreJson({ url: result.url, publicId: result.publicId });
  } catch (error) {
    if (error instanceof AdminApiDisabledError)
      return noStoreJson({ code: error.code }, { status: 403 });
    if (error instanceof AdminUnauthorizedError)
      return noStoreJson({ code: error.code }, { status: 401 });
    if (error instanceof AdminForbiddenError)
      return noStoreJson({ code: error.code }, { status: 403 });

    logError('admin_blog_image_upload_failed', error, {});
    return noStoreJson(
      { error: 'Upload failed', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
